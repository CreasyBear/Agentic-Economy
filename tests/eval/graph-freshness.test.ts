import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  checkGraphFreshness,
  isGraphRelevantDirtyPath,
  parseGitStatusPaths,
  parseGraphJsonCommit,
  parseGraphReportCommit,
} from '../scripts/assert-graph-fresh'

describe('graph freshness gate', () => {
  it('parses the checked-in graph report and graph JSON commit for current HEAD', () => {
    const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: new URL('../..', import.meta.url),
      encoding: 'utf8',
    }).trim()
    const report = readFileSync(
      new URL('../../.planning/graphs/GRAPH_REPORT.md', import.meta.url),
      'utf8',
    )
    const graphJson = readFileSync(
      new URL('../../.planning/graphs/graph.json', import.meta.url),
      'utf8',
    )

    expect(parseGraphReportCommit(report)).toBe(currentHead)
    expect(parseGraphJsonCommit(graphJson)).toBe(currentHead)
    expect(checkGraphFreshness({
      currentHead,
      graphReportText: report,
      graphJsonText: graphJson,
      dirtyPaths: [],
    })).toMatchObject({
      ok: true,
      status: 'fresh',
      currentHead,
      graphReportCommit: currentHead,
      graphJsonCommit: currentHead,
    })
  })

  it('detects a stale report commit against HEAD', () => {
    const result = checkGraphFreshness({
      currentHead: 'f614a82075365c016da70fe7024e30b2d2885d85',
      graphReportText: '- Built from commit: `31a8cfc31cf1e467efa76655ded27e64d2295139`',
      graphJsonText: '{"built_at_commit":"31a8cfc31cf1e467efa76655ded27e64d2295139"}',
      dirtyPaths: [],
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('stale')
    expect(result.staleReasons).toEqual([
      'graph_report_commit_mismatch:31a8cfc31cf1e467efa76655ded27e64d2295139',
      'graph_json_commit_mismatch:31a8cfc31cf1e467efa76655ded27e64d2295139',
    ])
  })

  it('marks runtime, eval, schema, and public projection changes as stale graph evidence', () => {
    const dirtyPaths = [
      '.planning/notes.md',
      'src/modules/harness/run-loop.ts',
      'src/modules/catalog/public.ts',
      'src/modules/registry/internal/schema.ts',
      'eval/answer/lib/cases.ts',
      'tests/eval/answer-pipeline.test.ts',
    ]

    const result = checkGraphFreshness({
      currentHead: 'f614a82075365c016da70fe7024e30b2d2885d85',
      graphReportText: '- Built from commit: `f614a82075365c016da70fe7024e30b2d2885d85`',
      dirtyPaths,
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('stale')
    expect(result.relevantDirtyPaths).toEqual([
      'eval/answer/lib/cases.ts',
      'src/modules/catalog/public.ts',
      'src/modules/harness/run-loop.ts',
      'src/modules/registry/internal/schema.ts',
      'tests/eval/answer-pipeline.test.ts',
    ])
    expect(result.staleReasons).toEqual(['graph_relevant_worktree_dirty'])
  })

  it('parses porcelain git status paths including renames and untracked files', () => {
    expect(parseGitStatusPaths([
      ' M src/modules/harness/run-loop.ts',
      '?? tests/eval/graph-freshness.test.ts',
      'R  eval/answer/lib/old.ts -> eval/answer/lib/cases.ts',
      ' M ".planning/path with spaces.md"',
    ].join('\n'))).toEqual([
      'src/modules/harness/run-loop.ts',
      'tests/eval/graph-freshness.test.ts',
      'eval/answer/lib/cases.ts',
      '.planning/path with spaces.md',
    ])
  })

  it('ignores unrelated dirty files for freshness while preserving path classification', () => {
    expect(isGraphRelevantDirtyPath('src/modules/harness/run-loop.ts')).toBe(true)
    expect(isGraphRelevantDirtyPath('src/modules/catalog/public.ts')).toBe(true)
    expect(isGraphRelevantDirtyPath('.planning/audits/notes.md')).toBe(false)

    expect(checkGraphFreshness({
      currentHead: 'f614a82075365c016da70fe7024e30b2d2885d85',
      graphReportText: '- Built from commit: `f614a82075365c016da70fe7024e30b2d2885d85`',
      dirtyPaths: ['.planning/audits/notes.md'],
    })).toMatchObject({
      ok: true,
      status: 'fresh',
      relevantDirtyPaths: [],
      staleReasons: [],
    })
  })
})
