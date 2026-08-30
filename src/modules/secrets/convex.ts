// Convex-safe schema seam. Keep Node/provider runtime exports in `public.ts`.
export {
  secretLifecycleRecordValue,
  secretLifecycleStateValue,
  secretPointerAuthorityValue,
} from './internal/convex-schema'
export {
  SecretPlaneError,
  secretGeneration,
  secretRef,
} from './secret-plane'
export type {
  SecretGeneration,
  SecretPointer,
  SecretPointerAdvanceRequest,
  SecretPointerStore,
  SecretRef,
  SecretTarget,
} from './secret-plane'
export { SecretLifecycleError } from './production-lifecycle'
export type {
  SecretLifecycleJournal,
  SecretLifecycleRecord,
  SecretPointerControl,
} from './production-lifecycle'
