import { execFileSync } from 'node:child_process'

export type EvidenceProvenanceV1 = Readonly<{
  schema: 'ae.evidence-provenance:v1'
  sourceRevision: string
  sourceTree: string
  command: string
  nodeVersion: string
  packageManager: string
  environment: 'MOCK/DEVELOPMENT ONLY'
  claimCeiling: string
}>

type GitRunner = (args: readonly string[]) => string

function systemGit(cwd: string): GitRunner {
  return (args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim()
}

function packageManagerVersion(cwd: string) {
  const version = execFileSync('npm', ['--version'], { cwd, encoding: 'utf8' }).trim()
  return `npm/${version}`
}

export function captureOfficialEvidenceProvenance(input: Readonly<{
  expectedRevision: string
  command: string
  claimCeiling: string
  cwd?: string
  git?: GitRunner
  nodeVersion?: string
  packageManager?: string
}>): EvidenceProvenanceV1 {
  if (!/^[0-9a-f]{40}$/.test(input.expectedRevision)) {
    throw new Error('evidence_revision_invalid')
  }
  const cwd = input.cwd ?? process.cwd()
  const git = input.git ?? systemGit(cwd)
  const head = git(['rev-parse', 'HEAD'])
  if (head !== input.expectedRevision) throw new Error('evidence_revision_mismatch')
  const dirty = git(['status', '--porcelain=v1', '--untracked-files=all'])
  if (dirty.length > 0) throw new Error('evidence_checkout_dirty')
  return {
    schema: 'ae.evidence-provenance:v1',
    sourceRevision: head,
    sourceTree: git(['rev-parse', 'HEAD^{tree}']),
    command: input.command,
    nodeVersion: input.nodeVersion ?? process.version,
    packageManager: input.packageManager ?? packageManagerVersion(cwd),
    environment: 'MOCK/DEVELOPMENT ONLY',
    claimCeiling: input.claimCeiling,
  }
}

export function verifyOfficialEvidenceProvenance(
  provenance: EvidenceProvenanceV1,
  input: Readonly<{
    expectedRevision: string
    command: string
    cwd?: string
    git?: GitRunner
    nodeVersion?: string
    packageManager?: string
  }>,
) {
  const current = captureOfficialEvidenceProvenance({
    ...input,
    claimCeiling: provenance.claimCeiling,
  })
  if (
    provenance.schema !== current.schema
    || provenance.sourceRevision !== current.sourceRevision
    || provenance.sourceTree !== current.sourceTree
    || provenance.command !== current.command
    || provenance.nodeVersion !== current.nodeVersion
    || provenance.packageManager !== current.packageManager
    || provenance.environment !== current.environment
  ) throw new Error('evidence_provenance_mismatch')
  return current
}
