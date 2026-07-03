import { describe, expect, it } from 'vitest'

import { checkGraphFreshness } from './assert-graph-fresh'

const GRAPH_COMMIT = '31a8cfc31cf1e467efa76655ded27e64d2295139'
const HEAD_COMMIT = 'f614a82075365c016da70fe7024e30b2d2885d85'

describe('graph freshness effective source tree checks', () => {
  it('allows graph metadata behind HEAD when commits since build are graph-irrelevant', () => {
    expect(checkGraphFreshness({
      currentHead: HEAD_COMMIT,
      graphReportText: `- Built from commit: \`${GRAPH_COMMIT}\``,
      graphJsonText: `{"built_at_commit":"${GRAPH_COMMIT}"}`,
      committedPathsSinceGraph: [
        '.planning/graphs/GRAPH_REPORT.md',
        'tests/scripts/assert-graph-fresh.ts',
      ],
      dirtyPaths: [],
    })).toMatchObject({
      ok: true,
      status: 'fresh',
      graphReportCommit: GRAPH_COMMIT,
      graphJsonCommit: GRAPH_COMMIT,
      relevantCommittedPaths: [],
      staleReasons: [],
    })
  })

  it('blocks graph metadata behind HEAD when committed source paths affect graph evidence', () => {
    expect(checkGraphFreshness({
      currentHead: HEAD_COMMIT,
      graphReportText: `- Built from commit: \`${GRAPH_COMMIT}\``,
      graphJsonText: `{"built_at_commit":"${GRAPH_COMMIT}"}`,
      committedPathsSinceGraph: ['src/modules/registry/public.ts'],
      dirtyPaths: [],
    })).toMatchObject({
      ok: false,
      status: 'stale',
      relevantCommittedPaths: ['src/modules/registry/public.ts'],
      staleReasons: [
        `graph_report_commit_mismatch:${GRAPH_COMMIT}`,
        `graph_json_commit_mismatch:${GRAPH_COMMIT}`,
        'graph_relevant_commits_since_build',
      ],
    })
  })
})
