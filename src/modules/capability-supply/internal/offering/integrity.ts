import { degradeBackend } from '@/lib/observability/degrade-backend'
import { capabilityOfferingRegistrationHash } from '../registration-schema'

import { offeringRegistrationFromRow, type CapabilityOfferingRow } from './registration'

export function offeringIntegrityIsValid(row: CapabilityOfferingRow): boolean {
  try {
    return capabilityOfferingRegistrationHash(offeringRegistrationFromRow(row)) === row.registrationHash
  } catch (cause) {
    return degradeBackend(cause, false, {
      site: 'offeringIntegrityIsValid', reason: 'invalid_response',
    })
  }
}
