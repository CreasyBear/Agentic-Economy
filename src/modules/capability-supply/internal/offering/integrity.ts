import { capabilityOfferingRegistrationHash } from '@/modules/capability-supply/public'

import { offeringRegistrationFromRow, type CapabilityOfferingRow } from './registration'

export function offeringIntegrityIsValid(row: CapabilityOfferingRow): boolean {
  try {
    return capabilityOfferingRegistrationHash(offeringRegistrationFromRow(row)) === row.registrationHash
  } catch {
    return false
  }
}
