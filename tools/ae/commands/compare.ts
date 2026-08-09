import type { CliOptions } from '../lib/args'
import { CliFailure, heading, line, printJson, table } from '../lib/output'
import { listFeeds, type Feed } from '../lib/feeds'
import { projectInput } from '../lib/validate-input'
import { isRecord } from '@/modules/common/is-record'
import { executeKeylessOperation } from '@/modules/capability-execution/operation-execute.server'

type FeedRun = {
  id: string
  name: string
  kind: 'ok' | 'refused' | 'error'
  output?: unknown
  reason?: string
  durationMs: number
  evidenceHash?: string
}

async function runOne(feed: Feed, input: Record<string, unknown>): Promise<FeedRun> {
  if (!feed.executable) {
    return { id: feed.id, name: feed.name, kind: 'error', reason: 'executable descriptor unavailable', durationMs: 0 }
  }
  // Project the shared input bag onto THIS feed's schema so a bag with keys for
  // other feeds is not rejected on additionalProperties:false.
  const projection = projectInput(feed.inputSchema, input)
  if (!projection.ok) {
    return { id: feed.id, name: feed.name, kind: 'refused', reason: projection.reason, durationMs: 0 }
  }
  const startedAt = Date.now()
  const result = await executeKeylessOperation({ operationRef: feed.id, input: projection.input })
  const durationMs = Date.now() - startedAt
  if (result.kind === 'ok') {
    return { id: feed.id, name: feed.name, kind: 'ok', output: result.output, durationMs, evidenceHash: result.evidenceHash }
  }
  if (result.kind === 'refused') {
    return { id: feed.id, name: feed.name, kind: 'refused', reason: result.reason, durationMs }
  }
  return { id: feed.id, name: feed.name, kind: 'error', reason: `${result.code}: ${result.reason}`, durationMs }
}

/**
 * `ae compare [--feeds a,b] [key=value ...] [--json]` — pull the same inputs
 * across several feeds in parallel and table the live results side by side.
 * Without `--feeds`, defaults to the feeds that accept and USE the provided
 * input keys (so `compare ids=bitcoin` compares crypto feeds). With no inputs it
 * takes the first matching feed and teaches you what is missing.
 */
export async function runCompareCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const feeds = await listFeeds()
  const input: Record<string, unknown> = {}
  for (const arg of args) {
    const eq = arg.indexOf('=')
    if (eq === -1) continue
    const raw = arg.slice(eq + 1)
    input[arg.slice(0, eq)] = raw === 'true' ? true : raw === 'false' ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw
  }

  if (options.feeds !== undefined) {
    const ids = options.feeds.split(',').map((id) => id.trim())
    const unknown = ids.find((id) => !feeds.some((f) => f.id === id))
    if (unknown !== undefined) {
      throw new CliFailure(`Unknown feed "${unknown}". List feeds with: ae feeds`, { kind: 'NOT_FOUND', code: 'unknown_feed', exitCode: 1 })
    }
    const byId = feeds.filter((f) => ids.includes(f.id))
    return finishCompare(options, byId, input)
  }
  // Default to the feeds that actually accept and USE the provided input keys
  // (schema projection), so `compare ids=bitcoin` compares crypto feeds — a feed
  // with an empty schema (e.g. a random-image feed) must not ride along.
  const matching = feeds.filter((feed) => {
    if (!feed.executable) return false
    const projection = projectInput(feed.inputSchema, input)
    if (!projection.ok) return false
    if (Object.keys(input).length === 0) return projection.ok
    const properties = isRecord(feed.inputSchema.properties)
      ? Object.keys(feed.inputSchema.properties)
      : []
    return Object.keys(input).some((key) => properties.includes(key))
  })
  if (matching.length === 0) {
    throw new CliFailure('No feeds accept the provided inputs. Pass keys those feeds share (e.g. latitude/longitude) or use --feeds=id1,id2.', { kind: 'INVALID_ARGUMENT', code: 'compare-usage' })
  }
  return finishCompare(options, matching, input)
}

async function finishCompare(options: CliOptions, selected: Feed[], input: Record<string, unknown>): Promise<void> {
  const runs = await Promise.all(selected.map((feed) => runOne(feed, input)))

  if (options.json) {
    printJson({ inputs: input, durationMs: runs.reduce((n, r) => n + r.durationMs, 0), results: runs })
    return
  }

  heading(`Feed comparison (${selected.length} feeds, inputs=${JSON.stringify(input)})`)
  for (const run of runs) {
    line('')
    table([
      ['feed', run.id],
      ['name', run.name],
      ['status', run.kind],
      ['duration', `${run.durationMs}ms`],
      ...(run.output === undefined ? [] : ([['output', JSON.stringify(run.output)]] as const)),
      ...(run.reason === undefined ? [] : ([['reason', run.reason]] as const)),
      ...(run.evidenceHash === undefined ? [] : ([['evidence', run.evidenceHash]] as const)),
    ])
  }
}
