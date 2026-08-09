import type { CliOptions } from '../lib/args'
import { CliFailure, heading, line, printJson, table } from '../lib/output'
import { resolveFeedAsync } from '../lib/feeds'
import { diagnoseInput, formatDiagnostic } from '../lib/validate-input'
import { executeKeylessOperation } from '@/modules/capability-execution/operation-execute.server'
import { operationResultToProblem, buildProblem } from '@/lib/errors'

function parseInputs(positionals: readonly string[]): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  for (const arg of positionals) {
    const eq = arg.indexOf('=')
    if (eq === -1) {
      throw new CliFailure(`Expected key=value input, got: ${arg}`, { kind: 'INVALID_ARGUMENT', code: 'run-usage' })
    }
    const key = arg.slice(0, eq)
    const raw = arg.slice(eq + 1)
    let value: unknown = raw
    if (raw === 'true') value = true
    else if (raw === 'false') value = false
    else if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw)
    input[key] = value
  }
  return input
}

/** Nested-empty: null, empty array/object, or an object whose leaves are all empty (e.g. {"bitcoin":{}}). */
function nestedEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every((child) => nestedEmpty(child))
  }
  return false
}

/** A list-shaped feed that matched nothing: its result has an empty-list field (e.g. {"results":[]}). */
function hasEmptyListField(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(child) && child.length === 0) return true
    if (/(results|items|data|matches)$/i.test(key) && Array.isArray(child) && child.length === 0) return true
  }
  return false
}

/** A geocoding/search feed that matched nothing returns a shell with no results (e.g. {"generationtime_ms":0.58}). */
function isGeocodeMissing(feedId: string, output: unknown): boolean {
  if (typeof feedId !== 'string' || !/geocod|search/i.test(feedId)) return false
  if (output === null || typeof output !== 'object' || Array.isArray(output)) return false
  const record = output as Record<string, unknown>
  return !('results' in record) || (Array.isArray(record.results) && record.results.length === 0)
}

/** `ae run <feed-id> [key=value ...] [--json]` — execute a keyless feed live. */
export async function runRunCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const id = args[0]?.trim()
  if (id === undefined || id.length === 0) {
    throw new CliFailure('Usage: ae run <operation-ref> [key=value ...]', { kind: 'INVALID_ARGUMENT', code: 'run-usage' })
  }
  const feed = await resolveFeedAsync(id)
  if (feed === undefined) {
    throw new CliFailure(`Unknown feed "${id}". List feeds with: ae feeds`, { kind: 'NOT_FOUND', code: 'unknown_feed' })
  }
  if (!feed.executable) {
    throw new CliFailure(`Feed "${feed.id}" is discoverable but its executable descriptor is unavailable (${feed.description}).`, { kind: 'FAILED_PRECONDITION', code: 'operation_not_executable' })
  }
  const input = parseInputs(args.slice(1))
  const startedAt = Date.now()
  const result = await executeKeylessOperation({ operationRef: feed.id, input })
  const ms = Date.now() - startedAt

  if (result.kind !== 'ok') {
    const isInvalid = result.kind === 'refused' && result.reason === 'input_invalid'
    const diagnostic = isInvalid
      ? formatDiagnostic(diagnoseInput(feed.inputSchema, input))
      : undefined
    const reason = result.kind === 'error'
      ? `${result.code}: ${result.reason}`
      : result.reason + (diagnostic === undefined ? '' : ` — ${diagnostic}`)
    const problem = operationResultToProblem(result) ?? { kind: 'INTERNAL' as const, code: 'execution_failed' }
    throw new CliFailure(
      `Feed "${feed.id}" failed (${result.kind}): ${reason}\nNo live value: mutable world data is surfaced only when it passes the feed contract.`,
      { exitCode: 1, kind: problem.kind, code: problem.code, detail: problem.detail },
    )
  }

  if (options.json) {
    const noData = result.kind === 'ok' && (nestedEmpty(result.output) || hasEmptyListField(result.output) || isGeocodeMissing(feed.id, result.output))
    if (noData) {
      const message = 'The feed returned no data — this usually means the supplied value/query matched nothing (e.g. an unknown currency/coin id, or a place that does not exist) rather than that the feed is broken.'
      printJson({
        ...buildProblem({ kind: 'no_data', code: 'no_data' }),
        message,
        feed: feed.id,
        capabilityId: feed.capabilityId,
        durationMs: ms,
        result,
      })
      return
    }
    const envelope: Record<string, unknown> = { feed: feed.id, capabilityId: feed.capabilityId, durationMs: ms, result }
    printJson(envelope)
    return
  }

  heading(`Feed "${feed.id}" — ${feed.name} (${ms}ms)`)
  table([
    ['evidence', result.evidenceHash],
    ['output', JSON.stringify(result.output)],
  ])
  if (nestedEmpty(result.output) || hasEmptyListField(result.output) || isGeocodeMissing(feed.id, result.output)) {
    line('The feed returned no data — this usually means the supplied value/query matched nothing (e.g. an unknown currency/coin id, or a place that does not exist) rather than that the feed is broken.')
  }
}
