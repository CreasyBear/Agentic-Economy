import { describe, expect, it } from 'vitest'

import {
  HTTP_OPERATIONS,
  MCP_TOOLS,
  PROOF_MANIFEST_VERSION,
  REQUIRED_OUTCOMES,
  verifyKernelProofManifest,
} from '../../../tools/release/kernel-proof-manifest.mjs'

const revision = 'a'.repeat(40)

describe('kernel proof manifest', () => {
  it('accepts one revision-bound HTTP and MCP proof for every governing outcome', () => {
    expect(verifyKernelProofManifest(validManifest(), revision)).toEqual({ ok: true, errors: [] })
  })

  it('fails closed when deployment identity, revision binding, or proof coverage is missing', () => {
    const manifest = validManifest()
    manifest.deployment.sourceRevision = 'b'.repeat(40)
    manifest.rootRuns.pop()

    expect(verifyKernelProofManifest(manifest, revision)).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'deployment_revision_mismatch',
        'root_run_mcp_unknown_reconciled_count_invalid',
      ]),
    })
  })
})

function validManifest() {
  return {
    schemaVersion: PROOF_MANIFEST_VERSION,
    sourceRevision: revision,
    deployment: {
      environment: 'production',
      deploymentId: 'loyal-peacock-107',
      siteUrl: 'https://loyal-peacock-107.convex.site',
      sourceRevision: revision,
    },
    descriptor: {
      url: 'https://loyal-peacock-107.convex.site/.well-known/ae-routing.json',
      protocolVersion: 'ae-routing:v1',
      httpOperations: [...HTTP_OPERATIONS],
      mcpTools: [...MCP_TOOLS],
      observedAt: '2026-07-12T00:00:00.000Z',
    },
    rootRuns: ['http', 'mcp'].flatMap((transport) => REQUIRED_OUTCOMES.map((outcome) => ({
      rootRunId: `root-run:${transport}:${outcome}`,
      transport,
      outcome,
      signatureRef: `signature:${transport}:${outcome}`,
      sourceRevision: revision,
      observedAt: '2026-07-12T00:00:00.000Z',
    }))),
  }
}
