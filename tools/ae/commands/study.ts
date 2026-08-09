import type { CliOptions } from '../lib/args'
import { CliFailure, heading, line, printJson, table } from '../lib/output'
import { listFeeds, type Feed } from '../lib/feeds'
import { projectInput } from '../lib/validate-input'
import { executeKeylessOperation } from '@/modules/capability-execution/operation-execute.server'
import { buildProblem } from '@/lib/errors'

type StudyEvidence =
  | { feedId: string; name: string; kind: 'evidence'; output: unknown; evidenceHash: string; durationMs: number }
  | { feedId: string; name: string; kind: 'closed'; reason: string; durationMs: number }

function tokenize(query: string): string[] {
  return query.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 2)
}

/** Score how relevant a feed is to a question by keyword overlap. */
function scoreFeed(feed: Feed, tokens: string[]): number {
  const haystack = `${feed.name} ${feed.description} ${feed.capabilityId} ${feed.kind}`.toLowerCase()
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
}

/**
 * `ae study <question> [key=value ...] [--json]` — a research workflow. It
 * discovers the feeds most relevant to the question, executes them, and returns
 * a grounded report where every claim is attributed to a feed + evidence hash
 * and every unknown/refused feed is marked. If no feed is relevant, it refuses
 * honestly rather than fabricate.
 */
export async function runStudyCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const question = args[0]?.trim()
  if (question === undefined || question.length === 0) {
    throw new CliFailure('Usage: ae study <question> [key=value ...]', { kind: 'INVALID_ARGUMENT', code: 'study-usage' })
  }
  const tokens = tokenize(question)
  const feeds = (await listFeeds()).filter((feed) => feed.executable)
  const ranked = feeds
    .map((feed) => ({ feed, score: scoreFeed(feed, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  if (ranked.length === 0) {
    const reason = `No feed in the agentic economy is relevant to "${question}". Available executable feeds: ${feeds.map((f) => f.id).join(', ') || 'none'}.`
    if (options.json) {
      printJson({
        ...buildProblem({ kind: 'no_data', code: 'no_data' }),
        message: reason,
        question,
        findings: [],
        unknowns: [],
      })
      return
    }
    heading(`Study refused`)
    line(reason)
    return
  }

  const inputsArg = args.slice(1).filter((arg) => !arg.startsWith('--'))
  const input: Record<string, unknown> = {}
  for (const arg of inputsArg) {
    const eq = arg.indexOf('=')
    if (eq === -1) continue
    const raw = arg.slice(eq + 1)
    input[arg.slice(0, eq)] = raw === 'true' ? true : raw === 'false' ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw
  }

  const evidence: StudyEvidence[] = await Promise.all(ranked.map(async ({ feed }) => {
    if (!feed.executable) {
      return { feedId: feed.id, name: feed.name, kind: 'closed', reason: 'executable descriptor unavailable', durationMs: 0 }
    }
    // Project the shared input bag onto THIS feed's schema (mirrors compare):
    // a question-relative bag with keys for other feeds must not be rejected on
    // additionalProperties:false.
    const projection = projectInput(feed.inputSchema, input)
    if (!projection.ok) {
      return { feedId: feed.id, name: feed.name, kind: 'closed', reason: projection.reason, durationMs: 0 }
    }
    const startedAt = Date.now()
    const result = await executeKeylessOperation({ operationRef: feed.id, input: projection.input })
    const durationMs = Date.now() - startedAt
    if (result.kind === 'ok') {
      return { feedId: feed.id, name: feed.name, kind: 'evidence', output: result.output, evidenceHash: result.evidenceHash, durationMs }
    }
    return { feedId: feed.id, name: feed.name, kind: 'closed', reason: result.kind === 'refused' ? result.reason : `${result.code}: ${result.reason}`, durationMs }
  }))

  const findings = evidence.filter((e) => e.kind === 'evidence')
  const unknowns = evidence.filter((e) => e.kind !== 'evidence').map((e) => ({ feed: e.feedId, reason: e.reason }))

  // Honest outcome: grounded only when every ranked feed served data. A ranked
  // feed that produced no finding makes the answer partial — never grounded.
  let outcome: 'grounded' | 'partial' | 'no_live_value'
  if (findings.length > 0 && unknowns.length === 0) outcome = 'grounded'
  else if (findings.length > 0) outcome = 'partial'
  else outcome = 'no_live_value'

  const unsatisfiedIds = unknowns.map((u) => u.feed)

  let conclusion: string
  if (outcome === 'grounded') {
    conclusion = 'Concluded from the live feeds above; each finding is attributed to a feed and a sha256 evidence hash.'
  } else if (outcome === 'partial') {
    conclusion = `Concluded from the served feeds above (each finding attributed to a feed + sha256 evidence hash), but the answer is partial: ${unsatisfiedIds.length} ranked feed(s) could not contribute — ${unsatisfiedIds.join(', ')}.`
  } else {
    conclusion = 'No feed returned live data; no claim is made beyond the open/refused feed statuses.'
  }

  // Hint at supplying inputs when a ranked feed was unknown because required
  // inputs were missing (e.g. coingecko needs ids + vs_currencies).
  const missingRequired = unknowns.filter((u) => /missing required/i.test(u.reason))
  let hint: string | undefined
  if (missingRequired.length > 0) {
    const params = Array.from(
      new Set(
        missingRequired.flatMap((u) => {
          const groups = u.reason.match(/missing required:\s*([^\n]+)/i)?.[1] ?? ''
          return groups.split(',').map((p) => p.trim()).filter(Boolean)
        }),
      ),
    )
    const assignments = params.length > 0 ? params.map((p) => `${p}=<value>`).join(' ') : '<required inputs>'
    hint = `Supply the required inputs inline, e.g. ae study "<question>" ${assignments}`
  }

  const report = {
    question,
    method: ranked.map(({ feed }) => feed.id),
    outcome,
    findings,
    unknowns,
    conclusion,
    ...(hint !== undefined ? { hint } : {}),
  }

  if (options.json) {
    printJson(report)
    return
  }

  heading(`Study: ${question}`)
  line(`Method (feeds): ${report.method.join(', ')}`)
  for (const evidenceItem of report.findings as StudyEvidence[]) {
    if (evidenceItem.kind !== 'evidence') continue
    line('')
    table([
      ['feed', evidenceItem.feedId],
      ['name', evidenceItem.name],
      ['evidence', evidenceItem.evidenceHash],
      ['duration', `${evidenceItem.durationMs}ms`],
      ['output', JSON.stringify(evidenceItem.output)],
    ])
  }
  if (unknowns.length > 0) {
    line('')
    heading('Unknowns (not asserted)')
    for (const unknown of unknowns) {
      line(`${unknown.feed}: ${unknown.reason}`)
    }
  }
  if (hint !== undefined) {
    line('')
    line(`Hint: ${hint}`)
  }
  line('')
  line(`Outcome: ${report.outcome} — ${report.conclusion}`)
}
