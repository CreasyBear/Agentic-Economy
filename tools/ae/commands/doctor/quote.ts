import type { JourneyNext } from '@/modules/actions/contract'
import { TOOL_QUOTE_PATH, toolQuoteResultSchema } from '@/modules/capability-execution/quote'
import { toolChoiceDescribeOutputSchema } from '@/modules/registry/tool-choice-contracts'
import { TOOL_MARKET_DESCRIBE_PATH } from '@/modules/registry/tool-entry'
import type { CliOptions } from '../../lib/args'
import { isLoopbackCliBaseUrl } from '../../lib/args'
import { continuationCommand } from '../../lib/continuation-command'
import { journeyNextCommand } from '../../lib/journey-next-command'
import { callJson } from '../../lib/output'
import { listCommandDescriptor } from '../list'
import { originFlags, type DoctorCheckDraft } from './shared'

const QUOTE_CHECK_TIMEOUT_MS = 5_000
// The Tool `npm run dev:local` (stage sandbox-tool) seeds and publishes.
const SANDBOX_TOOL_BUSINESS_SLUG = 'sandbox-aecon-reference'
const SANDBOX_TOOL_CAPABILITY_ID = 'sandbox.frankfurter-fx'
const SANDBOX_TOOL_QUOTE_INPUT = { from: 'EUR', to: 'USD' }
const LOCAL_DEV_COMMAND = continuationCommand(['npm', 'run', 'dev:local'])
const QUOTE_AUTHORITY_REFUSAL_CODES: readonly string[] = ['grant_not_found', 'budget_exceeded']
// A funding refusal means authority and commercial policy already admitted the sale, so it
// only proves purchase is unfunded: quoting warns instead of failing on these codes.
const QUOTE_FUNDING_REFUSAL_PATTERN = /^(insufficient_|funding_|balance_)/

/** A skipped Quote states why it could not run and never reports a pass. */
export function skippedQuoteCheck(reason: string, nextCommand?: string, code?: string): DoctorCheckDraft {
  const trimmedReason = reason.endsWith('.') ? reason.slice(0, -1) : reason
  return {
    id: 'quote', state: 'skipped', reason,
    summary: `Quote inspection was skipped: ${trimmedReason}.`,
    ...(nextCommand === undefined ? {} : { nextCommand }),
    ...(code === undefined ? {} : { code }),
  }
}
/**
 * Quote is the only check that proves a sale would be admitted. It runs the real
 * tool.quote route with the credential the buyer check just origin-bound, so it
 * is reached only from that guarded branch and never echoes credential material.
 */
export async function checkQuote(
  options: CliOptions,
  headers: Readonly<Record<string, string>>,
): Promise<DoctorCheckDraft> {
  const sandbox = await resolveSandboxTool(options.baseUrl)
  if (sandbox.kind === 'unavailable') return skippedQuoteCheck('quote inspection timed out')
  if (sandbox.kind === 'absent') {
    if (isLoopbackCliBaseUrl(options.baseUrl)) {
      return skippedQuoteCheck(
        'no routeable sandbox Tool on this loopback origin. The readiness probe only reaches public HTTPS endpoints, so the seeded sandbox Tool is listed on hosted origins (preview or production), not on 127.0.0.1. Discover and connect are provable here; Quote is provable on a hosted origin.',
        'ae doctor --base-url <hosted origin> --json',
        'loopback_readiness_unprovable',
      )
    }
    return skippedQuoteCheck('no sandbox Tool is published; run npm run dev:local (stage sandbox-tool)', LOCAL_DEV_COMMAND)
  }
  try {
    const outcome = await callJson(options.baseUrl, TOOL_QUOTE_PATH, {
      method: 'POST',
      headers,
      body: JSON.stringify({ toolRef: sandbox.toolRef, input: SANDBOX_TOOL_QUOTE_INPUT }),
      signal: AbortSignal.timeout(QUOTE_CHECK_TIMEOUT_MS),
    })
    const parsed = toolQuoteResultSchema.safeParse(outcome.body)
    // An unreadable Quote proves nothing about a sale, so it skips instead of passing.
    if (!outcome.ok || !parsed.success) return skippedQuoteCheck('quote inspection timed out')
    if (parsed.data.kind === 'refused') {
      const { code } = parsed.data
      const nextCommand = quoteRefusalCommand(options, code)
      if (QUOTE_FUNDING_REFUSAL_PATTERN.test(code)) {
        return {
          id: 'quote', state: 'warn',
          summary: `Quote reached the funding gate (${code}); authority and commercial policy are ready.`,
          ...(nextCommand === undefined ? {} : { nextCommand }),
        }
      }
      return {
        id: 'quote', state: 'fail',
        summary: `Quote for the sandbox Tool was refused (${code}).`,
        ...(nextCommand === undefined ? {} : { nextCommand }),
      }
    }
    const { price } = parsed.data
    return {
      id: 'quote', state: 'pass',
      summary: `Quote for the sandbox Tool was admitted at ${price.units} × 10^-${price.exponent} ${price.currency}.`,
    }
  } catch {
    return skippedQuoteCheck('quote inspection timed out')
  }
}

function quoteRefusalCommand(options: CliOptions, code: string): string | undefined {
  // Sandbox authority is what a local refusal usually lacks: `ae connect` first,
  // then reseed the grant the Quote path resolves.
  if (QUOTE_AUTHORITY_REFUSAL_CODES.includes(code)) return LOCAL_DEV_COMMAND
  if (QUOTE_FUNDING_REFUSAL_PATTERN.test(code)) return journeyNextCommand({ action: 'fund', args: {}, authority: 'agent_key' } satisfies JourneyNext, options)
  return continuationCommand(['ae', 'doctor', ...originFlags(options), '--json'])
}

type SandboxToolLookup =
  | Readonly<{ kind: 'found'; toolRef: string }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unavailable' }>

/** Find the seeded Tool in the deterministic catalog, then confirm its exact ref. */
async function resolveSandboxTool(baseUrl: string): Promise<SandboxToolLookup> {
  const signal = AbortSignal.timeout(QUOTE_CHECK_TIMEOUT_MS)
  let cursor: string | undefined
  const seen = new Set<string>()
  try {
    for (let page = 0; page < 10; page += 1) {
      const input = listCommandDescriptor.inputSchema.parse({ limit: 100, ...(cursor === undefined ? {} : { cursor }) })
      const outcome = await callJson(baseUrl, listCommandDescriptor.path, { method: 'POST', body: JSON.stringify(input), signal })
      const parsed = listCommandDescriptor.outputSchema.safeParse(outcome.body)
      if (!outcome.ok || !parsed.success || parsed.data.kind !== 'ok') return { kind: 'unavailable' }
      const candidate = parsed.data.items.find((tool) =>
        tool.provider.slug === SANDBOX_TOOL_BUSINESS_SLUG && tool.capabilityId === SANDBOX_TOOL_CAPABILITY_ID)
      if (candidate !== undefined) {
        const described = await callJson(baseUrl, TOOL_MARKET_DESCRIBE_PATH, { method: 'POST', body: JSON.stringify({ toolRef: candidate.toolRef }), signal })
        const exact = toolChoiceDescribeOutputSchema.safeParse(described.body)
        if (!described.ok || !exact.success || exact.data.kind !== 'found'
          || exact.data.tool.toolRef !== candidate.toolRef
          || exact.data.tool.provider.slug !== SANDBOX_TOOL_BUSINESS_SLUG
          || exact.data.tool.capabilityId !== SANDBOX_TOOL_CAPABILITY_ID) return { kind: 'unavailable' }
        return { kind: 'found', toolRef: candidate.toolRef }
      }
      if (!parsed.data.pagination.hasMore) return { kind: 'absent' }
      cursor = parsed.data.pagination.nextCursor
      if (cursor === undefined || seen.has(cursor)) return { kind: 'unavailable' }
      seen.add(cursor)
    }
    return { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}

