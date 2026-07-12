import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const PROOF_MANIFEST_VERSION = 'ae-kernel-proof-manifest:v1'
export const HTTP_OPERATIONS = ['route', 'authorize', 'execute', 'reconcile', 'inspect', 'cancel']
export const MCP_TOOLS = HTTP_OPERATIONS.map((operation) => `ae.${operation}`)
export const REQUIRED_OUTCOMES = ['success', 'fallback', 'failure', 'unknown_reconciled']

export function verifyKernelProofManifest(manifest, expectedRevision) {
  const errors = []
  if (!isRecord(manifest)) return { ok: false, errors: ['manifest_not_object'] }
  if (manifest.schemaVersion !== PROOF_MANIFEST_VERSION) errors.push('schema_version_invalid')
  if (!isGitRevision(expectedRevision)) errors.push('expected_revision_invalid')
  if (manifest.sourceRevision !== expectedRevision) errors.push('source_revision_mismatch')

  const deployment = manifest.deployment
  if (!isRecord(deployment)) errors.push('deployment_missing')
  else {
    if (deployment.environment !== 'production' && deployment.environment !== 'staging') errors.push('deployment_environment_invalid')
    if (!nonEmpty(deployment.deploymentId)) errors.push('deployment_id_missing')
    if (!httpsUrl(deployment.siteUrl)) errors.push('deployment_site_url_invalid')
    if (deployment.sourceRevision !== expectedRevision) errors.push('deployment_revision_mismatch')
  }

  const descriptor = manifest.descriptor
  if (!isRecord(descriptor)) errors.push('descriptor_missing')
  else {
    if (!httpsUrl(descriptor.url)) errors.push('descriptor_url_invalid')
    if (descriptor.protocolVersion !== 'ae-routing:v1') errors.push('descriptor_protocol_invalid')
    if (!sameStrings(descriptor.httpOperations, HTTP_OPERATIONS)) errors.push('descriptor_http_operations_invalid')
    if (!sameStrings(descriptor.mcpTools, MCP_TOOLS)) errors.push('descriptor_mcp_tools_invalid')
    if (!validTimestamp(descriptor.observedAt)) errors.push('descriptor_observed_at_invalid')
  }

  const rootRuns = Array.isArray(manifest.rootRuns) ? manifest.rootRuns : []
  if (rootRuns.length === 0) errors.push('root_runs_missing')
  for (const transport of ['http', 'mcp']) {
    for (const outcome of REQUIRED_OUTCOMES) {
      const matches = rootRuns.filter((run) => isRecord(run) && run.transport === transport && run.outcome === outcome)
      if (matches.length !== 1) errors.push(`root_run_${transport}_${outcome}_count_invalid`)
    }
  }
  for (const run of rootRuns) {
    if (!isRecord(run)) { errors.push('root_run_invalid'); continue }
    if (!nonEmpty(run.rootRunId)) errors.push('root_run_id_missing')
    if (!nonEmpty(run.signatureRef)) errors.push('root_run_signature_ref_missing')
    if (run.sourceRevision !== expectedRevision) errors.push('root_run_revision_mismatch')
    if (!validTimestamp(run.observedAt)) errors.push('root_run_observed_at_invalid')
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)].sort() }
}

export function readExpectedRevision(env = process.env) {
  const configured = env.AE_RELEASE_SOURCE_REVISION?.trim()
  if (configured) return configured
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

export function readManifest(env = process.env, argv = process.argv) {
  const inline = env.AE_KERNEL_PROOF_MANIFEST_JSON?.trim()
  if (inline) return JSON.parse(inline)
  const path = argv[2] ?? env.AE_KERNEL_PROOF_MANIFEST_PATH
  if (!path) throw new Error('kernel_proof_manifest_missing')
  return JSON.parse(readFileSync(path, 'utf8'))
}

function isRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0 }
function isGitRevision(value) { return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) }
function validTimestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function httpsUrl(value) { try { return typeof value === 'string' && new URL(value).protocol === 'https:' } catch { return false } }
function sameStrings(value, expected) { return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]) }
