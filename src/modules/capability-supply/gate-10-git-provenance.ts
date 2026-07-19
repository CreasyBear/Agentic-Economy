import { execFileSync } from 'node:child_process'

import { canonicalDigest } from '@/modules/common/canonical-digest'

export const gate10SourceBaseCommit = '43c7151a1f11a3c3db870cc2a275af8fdc019460'
export const gate10BaselineCommit = '69aea42cb27598cd208bcea3491f5d8e344fdaad'
export const gate10BaselineTree = 'a993430d77d5b60aea7b1b9a45c9ef934a782ad8'
export const gate10BaselineExecutableDigest =
  'sha256:749fc5dfb370463b580e40986981f0351ce48edb05bc7f0fa6705b86ebf82152'

export const gate10BaselineFiles = [
  'src/modules/capability-supply/development-host-scenario-runtime.ts',
  'src/modules/capability-supply/direct-endpoint-baseline-contract.ts',
  'src/modules/capability-supply/direct-endpoint-baseline-executor.ts',
  'tests/unit/capability-supply/direct-endpoint-baseline.test.ts',
  'tools/dev/direct-endpoint-baseline.ts',
] as const

const gate10EvidenceFiles = [
  ...gate10BaselineFiles,
  'package.json',
  'src/modules/action-invocation/application-service.ts',
  'src/modules/action-invocation/index.ts',
  'src/modules/capability-supply/gate-10-development-evidence.ts',
  'src/modules/capability-supply/gate-10-development-verifier.ts',
  'src/modules/capability-supply/gate-10-git-provenance.ts',
  'src/modules/capability-supply/gate-10-host-trace.ts',
  'src/modules/capability-supply/gate-10-measurement.ts',
  'tests/unit/capability-supply/gate-10-development-evidence.test.ts',
  'tests/unit/capability-supply/gate-10-measurement.test.ts',
  'tools/dev/adr-010-gate-10-run.ts',
  'tools/dev/adr-010-gate-10-verify.ts',
] as const

export type Gate10GitProvenance = Readonly<{
  sourceBaseCommit: string
  baselineCommit: string
  baselineTree: string
  baselineExecutableDigest: string
  baselineSourceDigest: string
  evidenceCommit: string
  evidenceTree: string
}>

export function deriveGate10GitProvenance(): Gate10GitProvenance {
  if (git(['status', '--porcelain', '--untracked-files=all', '--', ...gate10EvidenceFiles]).length > 0) {
    throw new Error('gate10_evidence_source_not_committed')
  }
  const evidenceCommit = git(['rev-parse', 'HEAD'])
  const evidenceTree = git(['rev-parse', 'HEAD^{tree}'])
  if (git(['rev-parse', `${gate10BaselineCommit}^{tree}`]) !== gate10BaselineTree
    || !isAncestor(gate10SourceBaseCommit, gate10BaselineCommit)
    || !isAncestor(gate10BaselineCommit, evidenceCommit)) {
    throw new Error('gate10_git_ancestry_invalid')
  }
  const changedBaselineFiles = git([
    'diff', '--name-only', `${gate10BaselineCommit}..${evidenceCommit}`, '--', ...gate10BaselineFiles,
  ])
  if (changedBaselineFiles.length > 0) throw new Error('gate10_frozen_baseline_drift')
  return {
    sourceBaseCommit: gate10SourceBaseCommit,
    baselineCommit: gate10BaselineCommit,
    baselineTree: gate10BaselineTree,
    baselineExecutableDigest: gate10BaselineExecutableDigest,
    baselineSourceDigest: baselineSourceDigest(),
    evidenceCommit,
    evidenceTree,
  }
}

function baselineSourceDigest(): string {
  return canonicalDigest(gate10BaselineFiles.map((path) => ({
    path,
    content: git(['show', `${gate10BaselineCommit}:${path}`], false),
  })))
}

function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: process.cwd(),
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function git(args: readonly string[], trim = true): string {
  const output = execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return trim ? output.trim() : output
}
