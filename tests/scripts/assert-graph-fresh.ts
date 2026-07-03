import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i

const GRAPH_RELEVANT_DIRTY_PREFIXES = [
  'eval/',
  'tests/eval/',
  'tests/unit/harness/',
  'tests/unit/answer-thread/',
  'tests/integration/answer-tool-calls.test.ts',
  'tests/integration/agent-tools-api.test.ts',
  'src/modules/harness/',
  'src/modules/answer-thread/',
  'src/modules/answer/',
  'src/modules/actions/',
  'src/modules/catalog/',
  'src/modules/registry/',
  'src/modules/common/action.ts',
  'src/routes/api.answer',
  'src/routes/api.agent',
  'src/routes/api.businesses',
  'src/routes/registry',
  'src/routes/$slug',
  'convex/schema.ts',
] as const

const GRAPH_IRRELEVANT_EXACT_PATHS = new Set([
  'tests/eval/graph-freshness.test.ts',
])

export type GraphFreshnessStatus = 'fresh' | 'stale' | 'invalid'

export type GraphFreshnessResult = {
  ok: boolean
  status: GraphFreshnessStatus
  currentHead: string
  graphReportCommit?: string
  graphJsonCommit?: string
  relevantDirtyPaths: readonly string[]
  relevantCommittedPaths: readonly string[]
  staleReasons: readonly string[]
}

export function parseGraphReportCommit(reportText: string): string | undefined {
  const match = reportText.match(/Built from commit:\s*`?([0-9a-f]{7,40})`?/i)
  return match?.[1]
}

export function parseGraphJsonCommit(graphJsonText: string): string | undefined {
  const parsed = JSON.parse(graphJsonText) as {
    built_at_commit?: unknown
    graph?: { built_at_commit?: unknown }
  }
  const rootCommit = parsed.built_at_commit
  if (typeof rootCommit === 'string' && SHA_PATTERN.test(rootCommit)) {
    return rootCommit
  }
  const graphCommit = parsed.graph?.built_at_commit
  return typeof graphCommit === 'string' && SHA_PATTERN.test(graphCommit) ? graphCommit : undefined
}

export function parseGitStatusPaths(statusText: string): string[] {
  return statusText
    .split(/\r?\n/g)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      const rawPath = line.length > 3 ? line.slice(3) : line.slice(2).trim()
      const renamedPath = rawPath.includes(' -> ')
        ? rawPath.slice(rawPath.lastIndexOf(' -> ') + ' -> '.length)
        : rawPath
      return unquoteGitPath(renamedPath)
    })
}

export function isGraphRelevantDirtyPath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/')
  if (GRAPH_IRRELEVANT_EXACT_PATHS.has(normalized)) {
    return false
  }
  return GRAPH_RELEVANT_DIRTY_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    /^src\/modules\/[^/]+\/.*schema\.ts$/.test(normalized) ||
    /^src\/modules\/[^/]+\/public\.ts$/.test(normalized)
}

export function checkGraphFreshness(input: {
  currentHead: string
  graphReportText?: string
  graphJsonText?: string
  dirtyPaths?: readonly string[]
  committedPathsSinceGraph?: readonly string[]
}): GraphFreshnessResult {
  const currentHead = input.currentHead.trim()
  const staleReasons: string[] = []

  if (!SHA_PATTERN.test(currentHead)) {
    staleReasons.push('current_head_invalid')
  }

  const graphReportCommit = input.graphReportText === undefined
    ? undefined
    : parseGraphReportCommit(input.graphReportText)
  const relevantCommittedPaths = (input.committedPathsSinceGraph ?? [])
    .filter(isGraphRelevantDirtyPath)
    .sort()
  const hasCommittedPathContext = input.committedPathsSinceGraph !== undefined
  const hasGraphRelevantCommitsSinceBuild = relevantCommittedPaths.length > 0

  if (graphReportCommit === undefined) {
    staleReasons.push('graph_report_commit_missing')
  } else if (
    graphReportCommit !== currentHead &&
    (!hasCommittedPathContext || hasGraphRelevantCommitsSinceBuild)
  ) {
    staleReasons.push(`graph_report_commit_mismatch:${graphReportCommit}`)
  }

  let graphJsonCommit: string | undefined
  if (input.graphJsonText !== undefined) {
    try {
      graphJsonCommit = parseGraphJsonCommit(input.graphJsonText)
      if (graphJsonCommit === undefined) {
        staleReasons.push('graph_json_commit_missing')
      } else if (graphReportCommit !== undefined && graphJsonCommit !== graphReportCommit) {
        staleReasons.push(`graph_json_report_commit_mismatch:${graphJsonCommit}`)
      } else if (
        graphJsonCommit !== currentHead &&
        (!hasCommittedPathContext || hasGraphRelevantCommitsSinceBuild)
      ) {
        staleReasons.push(`graph_json_commit_mismatch:${graphJsonCommit}`)
      }
    } catch {
      staleReasons.push('graph_json_invalid')
    }
  }

  const relevantDirtyPaths = (input.dirtyPaths ?? []).filter(isGraphRelevantDirtyPath).sort()
  if (relevantDirtyPaths.length > 0) {
    staleReasons.push('graph_relevant_worktree_dirty')
  }
  if (relevantCommittedPaths.length > 0) {
    staleReasons.push('graph_relevant_commits_since_build')
  }

  const invalid = staleReasons.some((reason) =>
    reason === 'current_head_invalid' ||
    reason === 'graph_report_commit_missing' ||
    reason === 'graph_json_commit_missing' ||
    reason === 'graph_json_invalid'
  )

  return {
    ok: staleReasons.length === 0,
    status: staleReasons.length === 0 ? 'fresh' : invalid ? 'invalid' : 'stale',
    currentHead,
    ...(graphReportCommit === undefined ? {} : { graphReportCommit }),
    ...(graphJsonCommit === undefined ? {} : { graphJsonCommit }),
    relevantDirtyPaths,
    relevantCommittedPaths,
    staleReasons,
  }
}

export function readCurrentGitHead(cwd = process.cwd()): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
}

export function readDirtyGitPaths(cwd = process.cwd()): string[] {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd,
    encoding: 'utf8',
  })
  return parseGitStatusPaths(status)
}

export function readCommittedGitPathsSince(commit: string, cwd = process.cwd()): string[] | undefined {
  try {
    const status = execFileSync('git', ['diff', '--name-only', `${commit}..HEAD`], {
      cwd,
      encoding: 'utf8',
    })
    return status
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  } catch {
    return undefined
  }
}

export function formatGraphFreshnessResult(result: GraphFreshnessResult): string {
  const lines = [
    `graph freshness: ${result.status}`,
    `operational evidence: ${result.ok ? 'usable' : 'blocked'}`,
    `current HEAD: ${result.currentHead}`,
    `graph report commit: ${result.graphReportCommit ?? '(missing)'}`,
    `graph json commit: ${result.graphJsonCommit ?? '(not checked)'}`,
  ]

  if (result.relevantDirtyPaths.length > 0) {
    lines.push('relevant dirty paths:')
    lines.push(...result.relevantDirtyPaths.map((path) => `- ${path}`))
  }
  if (result.relevantCommittedPaths.length > 0) {
    lines.push('relevant committed paths since graph build:')
    lines.push(...result.relevantCommittedPaths.map((path) => `- ${path}`))
  }

  if (result.staleReasons.length > 0) {
    lines.push('reasons:')
    lines.push(...result.staleReasons.map((reason) => `- ${reason}`))
  }

  if (!result.ok) {
    lines.push('next actions:')
    if (result.relevantDirtyPaths.length > 0) {
      lines.push('- settle or intentionally shelve graph-relevant dirty paths')
    }
    if (result.relevantCommittedPaths.length > 0) {
      lines.push('- rebuild graph artifacts after the graph-relevant commits')
    }
    if (result.staleReasons.some((reason) => reason.includes('commit_mismatch'))) {
      lines.push('- rebuild graph artifacts from the final source tree')
    }
    if (result.status === 'invalid') {
      lines.push('- restore valid .planning/graphs/GRAPH_REPORT.md and graph.json metadata')
    }
    lines.push('- rerun npm run test:graph-freshness before claiming operational graph evidence')
  }

  return lines.join('\n')
}

function unquoteGitPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed
  }
  try {
    return JSON.parse(trimmed) as string
  } catch {
    return trimmed.slice(1, -1)
  }
}

function readOptionalFile(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

function runCli(): void {
  const repoRoot = process.cwd()
  const graphReportPath = join(repoRoot, '.planning/graphs/GRAPH_REPORT.md')
  const graphJsonPath = join(repoRoot, '.planning/graphs/graph.json')
  const graphReportText = readOptionalFile(graphReportPath)
  const graphJsonText = readOptionalFile(graphJsonPath)
  const graphReportCommit = graphReportText === undefined
    ? undefined
    : parseGraphReportCommit(graphReportText)
  const result = checkGraphFreshness({
    currentHead: readCurrentGitHead(repoRoot),
    dirtyPaths: readDirtyGitPaths(repoRoot),
    ...(graphReportCommit === undefined ? {} : {
      committedPathsSinceGraph: readCommittedGitPathsSince(graphReportCommit, repoRoot),
    }),
    ...(graphReportText === undefined ? {} : { graphReportText }),
    ...(graphJsonText === undefined ? {} : { graphJsonText }),
  })

  const formatted = formatGraphFreshnessResult(result)
  if (!result.ok) {
    console.error(formatted)
    process.exitCode = 1
    return
  }
  console.log(formatted)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
}
