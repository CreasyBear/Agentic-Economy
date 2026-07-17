import { capabilityBindingRegistrationHash } from '@/modules/capability-supply/public'

import { bindingRegistrationFromRow, type CapabilityBindingRow } from './registration'

export function bindingIntegrityIsValid(row: CapabilityBindingRow): boolean {
  try {
    return capabilityBindingRegistrationHash(bindingRegistrationFromRow(row), {
      configJson: row.configJson, configDigest: row.configDigest,
    }) === row.registrationHash
  } catch {
    return false
  }
}
