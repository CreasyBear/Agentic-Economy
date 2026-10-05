import { query } from './_generated/server'
import { ownerEvidenceArgs, serviceUsageEvidenceValue } from './lib/capabilityExecution/serviceUsage/contracts'
import { readOwnerEvidenceHandler } from './lib/capabilityExecution/serviceUsage/read'

export const readOwnerEvidence = query({ args: ownerEvidenceArgs, returns: serviceUsageEvidenceValue, handler: readOwnerEvidenceHandler })
