export {
  bindingRegistrationFromRow,
  connectionAuthoritySnapshotFromProviderConnection,
  connectionAuthoritySnapshotIsValid,
  connectionAuthoritySnapshotMatches,
  connectionAuthoritySnapshotsEqual,
  transportAdmissionInput,
  type CapabilityBindingRow,
  type CapabilityConnectionAuthoritySnapshot,
} from './registration'

export { bindingIntegrityIsValid } from './integrity'

export { bindingRegistrationAudit } from './audit'

export {
  registerCapabilityTransportBinding,
  type BindingInsertRow,
  type BindingWritePorts,
  type RegisterBindingWriteResult,
} from './write'
