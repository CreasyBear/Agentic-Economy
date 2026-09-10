/**
 * Manage the hosted Stripe v1 webhook destinations (`webhookEndpoints`) as code,
 * for both test and live mode.
 *
 * Background: `docs/operations/vocabulary-cutover-preflight.md` (Stripe callback
 * targets) recorded the hosted destinations in a bad state - the replacement
 * destinations were disabled while the one enabled legacy destination was
 * API-version-unpinned and carried a wider event set than the worker consumes.
 * This tool makes that state declarative: plan first, apply on request.
 *
 * Scope: v1 `webhookEndpoints` only. The Accounts v2 destination
 * (`/api/stripe/webhook/accounts-v2`, id prefix `ed_`) is a v2 core event
 * destination on a different API resource and is deliberately left untouched.
 */
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

import Stripe from 'stripe'

/**
 * The event names the money webhook worker actually consumes.
 *
 * Source of truth: the `switch (event.type)` in `mapStripeMoneyWebhookEvent`,
 * `src/lib/server/stripe-money-webhook.ts:52-63`. The worker matches these names
 * as inline string cases and exports no list, so the list is restated here and
 * pinned by the "event set drift" case in
 * `tests/unit/release/stripe-webhook-destinations.test.ts`, which re-derives the
 * cases from the worker source text and fails if the two disagree.
 */
export const WORKER_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'refund.created',
  'refund.updated',
  'refund.failed',
] as const satisfies readonly Stripe.WebhookEndpointCreateParams.EnabledEvent[]

/** Path (repo-relative) of the worker module the event set is derived from. */
export const WORKER_SOURCE_PATH = 'src/lib/server/stripe-money-webhook.ts'

/** The SDK's pinned API version - the same constant `createStripeMoneyClient` uses. */
export const PINNED_API_VERSION = Stripe.API_VERSION

/** Redaction placeholder used in `--json` output for a freshly minted signing secret. */
export const SECRET_REDACTION = '<printed once above>'

export type StripeMode = 'test' | 'live'

export type WebhookEndpointRecord = Readonly<{
  id: string
  url: string
  api_version?: string | null
  enabled_events: readonly string[]
  status?: string
}>

export type PlanAction =
  | Readonly<{
      kind: 'create'
      url: string
      apiVersion: string
      events: readonly string[]
      reason: string
    }>
  | Readonly<{
      kind: 'update'
      id: string
      url: string
      events: readonly string[]
      reason: string
    }>
  | Readonly<{ kind: 'disable'; id: string; url: string; reason: string }>
  | Readonly<{ kind: 'keep'; id: string; url: string; reason: string }>

export type ApplyResult = Readonly<{
  action: PlanAction
  id: string
  secret?: string
}>

/** The slice of the Stripe client this tool touches, so tests can inject a double. */
export type WebhookEndpointsClient = Readonly<{
  webhookEndpoints: Readonly<{
    list: (
      params: Readonly<{ limit: number; starting_after?: string }>,
    ) => Promise<Readonly<{ data: readonly WebhookEndpointRecord[]; has_more?: boolean }>>
    create: (
      params: Readonly<{
        url: string
        api_version: string
        enabled_events: readonly string[]
      }>,
    ) => Promise<Readonly<{ id: string; secret?: string | null }>>
    update: (
      id: string,
      params: Readonly<{ enabled_events?: readonly string[]; disabled?: boolean }>,
    ) => Promise<Readonly<{ id: string }>>
  }>
}>

/**
 * Re-derive the consumed event names from the worker source text. Shared with the
 * drift test so both sides read the same cases out of the same switch.
 */
export function extractWorkerEventTypes(source: string): readonly string[] {
  const start = source.indexOf('switch (event.type) {')
  if (start < 0) throw new Error('stripe_webhook_worker_switch_missing')
  const end = source.indexOf('default:', start)
  if (end < 0) throw new Error('stripe_webhook_worker_default_missing')
  const names: string[] = []
  for (const match of source.slice(start, end).matchAll(/case "([^"]+)":/gu)) {
    const name = match[1]
    if (name !== undefined) names.push(name)
  }
  return names
}

function normalizeEvents(events: readonly string[]): readonly string[] {
  return [...new Set(events)].sort()
}

function sameEvents(left: readonly string[], right: readonly string[]): boolean {
  const a = normalizeEvents(left)
  const b = normalizeEvents(right)
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function isEnabled(endpoint: WebhookEndpointRecord): boolean {
  return endpoint.status !== 'disabled'
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}

/**
 * Desired state: exactly one enabled endpoint for `targetUrl`, pinned to
 * `apiVersion`, with `enabled_events` equal to `events`.
 *
 * 1. Find the canonical endpoint: same URL and already pinned to `apiVersion`
 *    (an enabled one wins over a disabled one).
 * 2. No canonical endpoint -> create it (`api_version` is immutable on an
 *    existing endpoint, so a version change means a new endpoint).
 * 3. Canonical endpoint that is enabled with the right event set -> keep.
 * 4. Otherwise -> update it (`enabled_events` + `disabled: false`).
 * 5. Every other enabled endpoint at the same URL, plus every enabled endpoint on
 *    the same host that is unpinned or carries a different event set, is disabled
 *    (never deleted) so its delivery history survives.
 */
export function planWebhookDestinations(
  input: Readonly<{
    existing: readonly WebhookEndpointRecord[]
    targetUrl: string
    events: readonly string[]
    apiVersion: string
  }>,
): readonly PlanAction[] {
  const desired = normalizeEvents(input.events)
  const targetHost = hostOf(input.targetUrl)
  const sameUrl = input.existing.filter((endpoint) => endpoint.url === input.targetUrl)
  const pinnedToTarget = (endpoint: WebhookEndpointRecord): boolean =>
    (endpoint.api_version ?? undefined) === input.apiVersion
  const canonical =
    sameUrl.find((endpoint) => pinnedToTarget(endpoint) && isEnabled(endpoint)) ??
    sameUrl.find(pinnedToTarget)

  const actions: PlanAction[] = []
  if (canonical === undefined) {
    actions.push({
      kind: 'create',
      url: input.targetUrl,
      apiVersion: input.apiVersion,
      events: desired,
      reason: sameUrl.length === 0 ? 'no_destination_for_url' : 'api_version_immutable_recreate',
    })
  } else if (isEnabled(canonical) && sameEvents(canonical.enabled_events, desired)) {
    actions.push({ kind: 'keep', id: canonical.id, url: canonical.url, reason: 'already_desired' })
  } else {
    actions.push({
      kind: 'update',
      id: canonical.id,
      url: canonical.url,
      events: desired,
      reason: isEnabled(canonical) ? 'event_set_drift' : 'destination_disabled',
    })
  }

  for (const endpoint of input.existing) {
    if (endpoint.id === canonical?.id || !isEnabled(endpoint)) continue
    const pinned = pinnedToTarget(endpoint)
    if (endpoint.url === input.targetUrl) {
      actions.push({
        kind: 'disable',
        id: endpoint.id,
        url: endpoint.url,
        reason: pinned ? 'duplicate_destination_for_url' : 'api_version_unpinned_replaced',
      })
      continue
    }
    if (targetHost === undefined || hostOf(endpoint.url) !== targetHost) continue
    if (pinned && sameEvents(endpoint.enabled_events, desired)) continue
    actions.push({
      kind: 'disable',
      id: endpoint.id,
      url: endpoint.url,
      reason: pinned ? 'legacy_event_set' : 'legacy_api_version_unpinned',
    })
  }
  return actions
}

export async function listWebhookEndpoints(
  client: WebhookEndpointsClient,
): Promise<readonly WebhookEndpointRecord[]> {
  const collected: WebhookEndpointRecord[] = []
  let startingAfter: string | undefined
  for (;;) {
    const page = await client.webhookEndpoints.list(
      startingAfter === undefined ? { limit: 100 } : { limit: 100, starting_after: startingAfter },
    )
    collected.push(...page.data)
    const last = page.data[page.data.length - 1]
    if (page.has_more !== true || last === undefined) return collected
    startingAfter = last.id
  }
}

export async function applyPlan(
  client: WebhookEndpointsClient,
  actions: readonly PlanAction[],
): Promise<readonly ApplyResult[]> {
  const results: ApplyResult[] = []
  for (const action of actions) {
    switch (action.kind) {
      case 'create': {
        const created = await client.webhookEndpoints.create({
          url: action.url,
          api_version: action.apiVersion,
          enabled_events: action.events,
        })
        results.push({
          action,
          id: created.id,
          ...(typeof created.secret === 'string' ? { secret: created.secret } : {}),
        })
        break
      }
      case 'update': {
        await client.webhookEndpoints.update(action.id, {
          enabled_events: action.events,
          disabled: false,
        })
        results.push({ action, id: action.id })
        break
      }
      case 'disable': {
        await client.webhookEndpoints.update(action.id, { disabled: true })
        results.push({ action, id: action.id })
        break
      }
      case 'keep': {
        results.push({ action, id: action.id })
        break
      }
    }
  }
  return results
}

export function formatActionTable(actions: readonly PlanAction[]): string {
  const rows = actions.map((action) => [
    action.kind,
    action.kind === 'create' ? '(new)' : action.id,
    action.url,
    action.reason,
  ])
  const header = ['ACTION', 'ENDPOINT', 'URL', 'REASON']
  const widths = header.map((label, column) =>
    Math.max(label.length, ...rows.map((row) => (row[column] ?? '').length)),
  )
  const line = (cells: readonly string[]): string =>
    cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ').trimEnd()
  return [line(header), ...rows.map(line)].join('\n')
}

export function modeOfSecretKey(secretKey: string): StripeMode | undefined {
  if (secretKey.startsWith('sk_test_')) return 'test'
  if (secretKey.startsWith('sk_live_')) return 'live'
  return undefined
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replaceAll(/^\[|\]$/gu, '')
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    /^127\./u.test(host)
  )
}

export function validateTargetUrl(value: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return 'url_not_parseable'
  }
  if (parsed.protocol !== 'https:') return 'url_not_https'
  if (isLoopbackHost(parsed.hostname)) return 'url_loopback_not_reachable_by_stripe'
  return undefined
}

const HELP = `stripe:webhooks - manage the hosted Stripe v1 webhook destinations as code.

Usage
  npm run stripe:webhooks -- --mode test|live --url <https url> [--apply] [--confirm-live] [--json]

Options
  --mode <test|live>  Required. Must match the STRIPE_SECRET_KEY prefix
                      (test -> sk_test_, live -> sk_live_); a mismatch exits 2
                      before any API call is made.
  --url <url>         Required. The https destination URL. Loopback hosts are
                      rejected because Stripe cannot reach them.
  --apply             Perform the writes. Without it the tool is a dry run: it
                      lists and prints the plan and changes nothing.
  --confirm-live      Required in addition to --apply when --mode live.
  --json              Emit the plan/result as JSON on stdout. A newly created
                      signing secret is printed once on stderr and redacted to
                      "${SECRET_REDACTION}" in the JSON.
  --help              Show this text.

Environment
  STRIPE_SECRET_KEY   The key used for the list/create/update calls.

Desired state
  Exactly one enabled endpoint for the URL, api_version pinned to the SDK
  constant (${PINNED_API_VERSION}), enabled_events equal to the ${WORKER_WEBHOOK_EVENTS.length} events the money
  webhook worker consumes (${WORKER_SOURCE_PATH}):
${WORKER_WEBHOOK_EVENTS.map((event) => `    ${event}`).join('\n')}

  api_version cannot be changed on an existing endpoint, so a version mismatch
  creates a replacement and disables the old one. Superseded and legacy
  destinations on the same host are disabled, never deleted, so their delivery
  history survives.

  Only v1 webhookEndpoints are managed. The Accounts v2 destination
  (/api/stripe/webhook/accounts-v2, id prefix ed_) is a v2 core event
  destination on a separate API resource; this tool never touches it, and its
  signing secret stays in STRIPE_V2_WEBHOOK_SECRET.

Secrets
  On create the endpoint signing secret is printed exactly once. Store it as
  STRIPE_WEBHOOK_SECRET. It is never logged again and cannot be re-read from
  the API.
`

export type CliDependencies = Readonly<{
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
  out: (line: string) => void
  err: (line: string) => void
  createClient?: (secretKey: string) => WebhookEndpointsClient
}>

function stripeClient(secretKey: string): WebhookEndpointsClient {
  const stripe = new Stripe(secretKey, {
    apiVersion: Stripe.API_VERSION,
    maxNetworkRetries: 2,
    typescript: true,
  })
  return {
    webhookEndpoints: {
      list: async (params) => await stripe.webhookEndpoints.list(params),
      create: async (params) =>
        await stripe.webhookEndpoints.create({
          url: params.url,
          // The plan carries the version as a plain string; the SDK narrows it to
          // its literal union of published API versions.
          api_version: params.api_version as Stripe.WebhookEndpointCreateParams.ApiVersion,
          enabled_events: [...params.enabled_events],
        }),
      update: async (id, params) =>
        await stripe.webhookEndpoints.update(id, {
          ...(params.enabled_events === undefined
            ? {}
            : { enabled_events: [...params.enabled_events] }),
          ...(params.disabled === undefined ? {} : { disabled: params.disabled }),
        }),
    },
  }
}

export async function runCli(deps: CliDependencies): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      args: [...deps.argv],
      options: {
        mode: { type: 'string' },
        url: { type: 'string' },
        apply: { type: 'boolean', default: false },
        'confirm-live': { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    })
  } catch (error: unknown) {
    deps.err(error instanceof Error ? error.message : 'stripe_webhooks_arguments_invalid')
    return 2
  }
  const values = parsed.values
  if (values.help === true) {
    deps.out(HELP)
    return 0
  }

  const mode = values.mode
  if (mode !== 'test' && mode !== 'live') {
    deps.err('stripe_webhooks_mode_required: pass --mode test or --mode live')
    return 2
  }
  const targetUrl = values.url
  if (targetUrl === undefined || targetUrl === '') {
    deps.err('stripe_webhooks_url_required: pass --url <https webhook url>')
    return 2
  }
  const urlProblem = validateTargetUrl(targetUrl)
  if (urlProblem !== undefined) {
    deps.err(`stripe_webhooks_url_invalid: ${urlProblem}`)
    return 2
  }
  const apply = values.apply === true
  if (mode === 'live' && apply && values['confirm-live'] !== true) {
    deps.err('stripe_webhooks_live_apply_unconfirmed: live --apply also requires --confirm-live')
    return 2
  }

  const secretKey = deps.env.STRIPE_SECRET_KEY
  if (secretKey === undefined || secretKey === '') {
    deps.err('stripe_webhooks_key_missing: set STRIPE_SECRET_KEY')
    return 2
  }
  const keyMode = modeOfSecretKey(secretKey)
  if (keyMode !== mode) {
    deps.err(
      `stripe_webhooks_key_mode_mismatch: --mode ${mode} requires an sk_${mode}_ key, STRIPE_SECRET_KEY is ${keyMode ?? 'not an sk_ key'}`,
    )
    return 2
  }

  const client = (deps.createClient ?? stripeClient)(secretKey)
  const existing = await listWebhookEndpoints(client)
  const actions = planWebhookDestinations({
    existing,
    targetUrl,
    events: WORKER_WEBHOOK_EVENTS,
    apiVersion: PINNED_API_VERSION,
  })

  const json = values.json === true
  if (!json) {
    deps.out(
      `Stripe webhook destinations - mode ${mode}, api_version ${PINNED_API_VERSION}, ${apply ? 'APPLY' : 'dry run'}`,
    )
    deps.out(`Target ${targetUrl}`)
    deps.out(`Events ${WORKER_WEBHOOK_EVENTS.join(', ')}`)
    deps.out('')
    deps.out(formatActionTable(actions))
  }

  if (!apply) {
    if (json) {
      deps.out(
        JSON.stringify(
          {
            mode,
            url: targetUrl,
            apiVersion: PINNED_API_VERSION,
            events: [...WORKER_WEBHOOK_EVENTS],
            applied: false,
            actions,
          },
          null,
          2,
        ),
      )
    } else {
      deps.out('')
      deps.out('Dry run: nothing was changed. Re-run with --apply to perform these actions.')
    }
    return 0
  }

  const results = await applyPlan(client, actions)
  const secretSink = json ? deps.err : deps.out
  for (const result of results) {
    if (result.secret === undefined) continue
    secretSink('')
    secretSink(`Signing secret for ${result.id} (printed once, never logged again):`)
    secretSink(`  ${result.secret}`)
    secretSink('  Store it as STRIPE_WEBHOOK_SECRET.')
    secretSink(
      '  The Accounts v2 destination is separate and keeps its own STRIPE_V2_WEBHOOK_SECRET.',
    )
  }
  if (json) {
    deps.out(
      JSON.stringify(
        {
          mode,
          url: targetUrl,
          apiVersion: PINNED_API_VERSION,
          events: [...WORKER_WEBHOOK_EVENTS],
          applied: true,
          results: results.map((result) => ({
            kind: result.action.kind,
            id: result.id,
            url: result.action.url,
            reason: result.action.reason,
            ...(result.secret === undefined ? {} : { secret: SECRET_REDACTION }),
          })),
        },
        null,
        2,
      ),
    )
  } else {
    deps.out('')
    deps.out(`Applied ${results.length} action(s).`)
  }
  return 0
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  runCli({
    argv: process.argv.slice(2),
    env: process.env,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'stripe_webhooks_failed'}\n`,
      )
      process.exitCode = 1
    })
}
