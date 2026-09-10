import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import {
  applyPlan,
  extractWorkerEventTypes,
  PINNED_API_VERSION,
  planWebhookDestinations,
  runCli,
  SECRET_REDACTION,
  WORKER_SOURCE_PATH,
  WORKER_WEBHOOK_EVENTS,
  type PlanAction,
  type WebhookEndpointRecord,
  type WebhookEndpointsClient,
} from '../../../tools/release/stripe-webhook-destinations'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TARGET_URL = 'https://agentic-economy-package4-release.vercel.app/api/stripe/webhook'
const EVENTS = [...WORKER_WEBHOOK_EVENTS]

function endpoint(overrides: Partial<WebhookEndpointRecord> = {}): WebhookEndpointRecord {
  return {
    id: 'we_default',
    url: TARGET_URL,
    api_version: PINNED_API_VERSION,
    enabled_events: EVENTS,
    status: 'enabled',
    ...overrides,
  }
}

function plan(existing: readonly WebhookEndpointRecord[]): readonly PlanAction[] {
  return planWebhookDestinations({
    existing,
    targetUrl: TARGET_URL,
    events: EVENTS,
    apiVersion: PINNED_API_VERSION,
  })
}

type ClientDouble = Readonly<{
  client: WebhookEndpointsClient
  list: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}>

function clientDouble(
  existing: readonly WebhookEndpointRecord[] = [],
  created: Readonly<{ id: string; secret?: string }> = { id: 'we_new', secret: 'whsec_created' },
): ClientDouble {
  const list = vi.fn(async () => ({ data: existing, has_more: false }))
  const create = vi.fn(async () => created)
  const update = vi.fn(async (id: string) => ({ id }))
  return { client: { webhookEndpoints: { list, create, update } }, list, create, update }
}

type CliCapture = Readonly<{ code: number; out: readonly string[]; err: readonly string[] }>

async function invoke(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  double?: ClientDouble,
): Promise<CliCapture> {
  const out: string[] = []
  const err: string[] = []
  const code = await runCli({
    argv,
    env,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    ...(double === undefined ? {} : { createClient: () => double.client }),
  })
  return { code, out, err }
}

describe('stripe webhook destination planning', () => {
  it('creates the destination on an empty account', () => {
    expect(plan([])).toEqual([
      {
        kind: 'create',
        url: TARGET_URL,
        apiVersion: PINNED_API_VERSION,
        events: [...EVENTS].sort(),
        reason: 'no_destination_for_url',
      },
    ])
  })

  it('keeps an already-correct destination', () => {
    expect(plan([endpoint({ id: 'we_ok' })])).toEqual([
      { kind: 'keep', id: 'we_ok', url: TARGET_URL, reason: 'already_desired' },
    ])
  })

  it('updates a pinned destination whose event set drifted', () => {
    const actions = plan([
      endpoint({ id: 'we_drift', enabled_events: [...EVENTS, 'checkout.session.expired'] }),
    ])
    expect(actions).toEqual([
      {
        kind: 'update',
        id: 'we_drift',
        url: TARGET_URL,
        events: [...EVENTS].sort(),
        reason: 'event_set_drift',
      },
    ])
  })

  it('re-enables a disabled but correctly pinned destination', () => {
    expect(plan([endpoint({ id: 'we_off', status: 'disabled' })])).toEqual([
      {
        kind: 'update',
        id: 'we_off',
        url: TARGET_URL,
        events: [...EVENTS].sort(),
        reason: 'destination_disabled',
      },
    ])
  })

  it('creates a replacement and disables the old one when api_version differs', () => {
    const actions = plan([endpoint({ id: 'we_old', api_version: '2024-06-20' })])
    expect(actions).toEqual([
      {
        kind: 'create',
        url: TARGET_URL,
        apiVersion: PINNED_API_VERSION,
        events: [...EVENTS].sort(),
        reason: 'api_version_immutable_recreate',
      },
      {
        kind: 'disable',
        id: 'we_old',
        url: TARGET_URL,
        reason: 'api_version_unpinned_replaced',
      },
    ])
    expect(actions[0]?.kind).toBe('create')
  })

  it('disables the enabled legacy unpinned destination on the same host', () => {
    const actions = plan([
      endpoint({ id: 'we_good' }),
      endpoint({
        id: 'we_legacy',
        url: 'https://agentic-economy-package4-release.vercel.app/api/stripe/legacy-webhook',
        api_version: null,
        enabled_events: [...EVENTS, 'checkout.session.expired'],
      }),
    ])
    expect(actions).toEqual([
      { kind: 'keep', id: 'we_good', url: TARGET_URL, reason: 'already_desired' },
      {
        kind: 'disable',
        id: 'we_legacy',
        url: 'https://agentic-economy-package4-release.vercel.app/api/stripe/legacy-webhook',
        reason: 'legacy_api_version_unpinned',
      },
    ])
  })

  it('leaves destinations on other hosts and already-disabled destinations alone', () => {
    const actions = plan([
      endpoint({ id: 'we_good' }),
      endpoint({ id: 'we_other_host', url: 'https://example.com/api/stripe/webhook', api_version: null }),
      endpoint({ id: 'we_already_off', api_version: null, status: 'disabled' }),
    ])
    expect(actions).toEqual([
      { kind: 'keep', id: 'we_good', url: TARGET_URL, reason: 'already_desired' },
    ])
  })
})

describe('stripe webhook destination apply', () => {
  it('creates before disabling and returns the fresh secret', async () => {
    const double = clientDouble()
    const results = await applyPlan(
      double.client,
      plan([endpoint({ id: 'we_old', api_version: '2024-06-20' })]),
    )
    expect(double.create).toHaveBeenCalledWith({
      url: TARGET_URL,
      api_version: PINNED_API_VERSION,
      enabled_events: [...EVENTS].sort(),
    })
    expect(double.update).toHaveBeenCalledWith('we_old', { disabled: true })
    expect(double.create.mock.invocationCallOrder[0]).toBeLessThan(
      double.update.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    )
    expect(results.map((result) => result.secret)).toEqual(['whsec_created', undefined])
  })

  it('re-enables and rewrites the event set on update', async () => {
    const double = clientDouble()
    await applyPlan(
      double.client,
      plan([endpoint({ id: 'we_drift', enabled_events: ['refund.created'] })]),
    )
    expect(double.update).toHaveBeenCalledWith('we_drift', {
      enabled_events: [...EVENTS].sort(),
      disabled: false,
    })
    expect(double.create).not.toHaveBeenCalled()
  })
})

describe('stripe webhook destination CLI', () => {
  it('refuses a key whose mode does not match --mode before any API call', async () => {
    const double = clientDouble()
    const result = await invoke(
      ['--mode', 'live', '--url', TARGET_URL],
      { STRIPE_SECRET_KEY: 'sk_test_abc' },
      double,
    )
    expect(result.code).toBe(2)
    expect(result.err.join('\n')).toContain('stripe_webhooks_key_mode_mismatch')
    expect(double.list).not.toHaveBeenCalled()
  })

  it('refuses a live apply without --confirm-live', async () => {
    const double = clientDouble()
    const result = await invoke(
      ['--mode', 'live', '--url', TARGET_URL, '--apply'],
      { STRIPE_SECRET_KEY: 'sk_live_abc' },
      double,
    )
    expect(result.code).toBe(2)
    expect(result.err.join('\n')).toContain('stripe_webhooks_live_apply_unconfirmed')
    expect(double.list).not.toHaveBeenCalled()
  })

  it('refuses a non-https or loopback url', async () => {
    for (const url of ['http://example.com/hook', 'https://localhost:3000/hook', 'https://127.0.0.1/hook']) {
      const result = await invoke(['--mode', 'test', '--url', url], {
        STRIPE_SECRET_KEY: 'sk_test_abc',
      })
      expect(result.code).toBe(2)
      expect(result.err.join('\n')).toContain('stripe_webhooks_url_invalid')
    }
  })

  it('performs no writes in dry-run mode', async () => {
    const double = clientDouble([endpoint({ id: 'we_old', api_version: '2024-06-20' })])
    const result = await invoke(
      ['--mode', 'test', '--url', TARGET_URL],
      { STRIPE_SECRET_KEY: 'sk_test_abc' },
      double,
    )
    expect(result.code).toBe(0)
    expect(double.list).toHaveBeenCalled()
    expect(double.create).not.toHaveBeenCalled()
    expect(double.update).not.toHaveBeenCalled()
    expect(result.out.join('\n')).toContain('Dry run')
    expect(result.out.join('\n')).toContain('we_old')
  })

  it('prints the created signing secret exactly once with the storage instruction', async () => {
    const double = clientDouble([])
    const result = await invoke(
      ['--mode', 'test', '--url', TARGET_URL, '--apply'],
      { STRIPE_SECRET_KEY: 'sk_test_abc' },
      double,
    )
    expect(result.code).toBe(0)
    const printed = [...result.out, ...result.err].join('\n')
    expect(printed.split('whsec_created').length - 1).toBe(1)
    expect(printed).toContain('STRIPE_WEBHOOK_SECRET')
    expect(printed).toContain('STRIPE_V2_WEBHOOK_SECRET')
  })

  it('redacts the secret in --json output after printing it once', async () => {
    const double = clientDouble([])
    const result = await invoke(
      ['--mode', 'test', '--url', TARGET_URL, '--apply', '--json'],
      { STRIPE_SECRET_KEY: 'sk_test_abc' },
      double,
    )
    expect(result.code).toBe(0)
    expect(result.err.join('\n')).toContain('whsec_created')
    const payload: unknown = JSON.parse(result.out.join('\n'))
    expect(payload).toMatchObject({
      mode: 'test',
      url: TARGET_URL,
      apiVersion: PINNED_API_VERSION,
      applied: true,
      results: [{ kind: 'create', id: 'we_new', secret: SECRET_REDACTION }],
    })
    expect(result.out.join('\n')).not.toContain('whsec_created')
  })

  it('prints usage for --help', async () => {
    const result = await invoke(['--help'], {})
    expect(result.code).toBe(0)
    expect(result.out.join('\n')).toContain('--confirm-live')
  })
})

describe('worker event set drift', () => {
  it('matches the event names the money webhook worker matches inline', () => {
    const source = readFileSync(path.join(REPO_ROOT, WORKER_SOURCE_PATH), 'utf8')
    expect([...extractWorkerEventTypes(source)].sort()).toEqual([...WORKER_WEBHOOK_EVENTS].sort())
  })
})
