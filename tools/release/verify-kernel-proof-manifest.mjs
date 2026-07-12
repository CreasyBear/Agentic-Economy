#!/usr/bin/env node
import { readExpectedRevision, readManifest, verifyKernelProofManifest } from './kernel-proof-manifest.mjs'

try {
  const expectedRevision = readExpectedRevision()
  const result = verifyKernelProofManifest(readManifest(), expectedRevision)
  if (!result.ok) {
    console.error(JSON.stringify({ kind: 'kernel_proof_manifest_refused', expectedRevision, errors: result.errors }))
    process.exitCode = 1
  } else {
    console.log(JSON.stringify({ kind: 'kernel_proof_manifest_verified', sourceRevision: expectedRevision }))
  }
} catch (error) {
  console.error(JSON.stringify({
    kind: 'kernel_proof_manifest_refused',
    errors: [error instanceof Error ? error.message : 'kernel_proof_manifest_unreadable'],
  }))
  process.exitCode = 1
}
