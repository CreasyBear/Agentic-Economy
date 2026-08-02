// Convex isolate-safe seam: pure contract/gate exports only.
// public.ts re-exports the TanStack source layer (Clerk-tainted) and must not
// be imported from convex/ hosts.
export {
  admitBasStart,
  createExternalRunEvidence,
  createExternalRunManifest,
  externalRunAdmittedStartIntegrityValid,
  externalRunAdmittedStartSchema,
  externalRunEvidenceIntegrityValid,
  externalRunEvidenceSchema,
  externalRunManifestIntegrityValid,
  externalRunManifestSchema,
  type ExternalRunAdmittedStart,
  type ExternalRunEvidence,
  type ExternalRunManifest,
} from './internal/contract'
export { computeExternalRunGate } from './internal/gate'
