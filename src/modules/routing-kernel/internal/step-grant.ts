import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import { canonicalAuthorityDigest } from './authority-digest'
import { isCanonicalAuthorityDigest } from './authority-digest'
import type { StepGrant } from './model'

type StepGrantMaterial = Omit<StepGrant, 'grantDigest'>

export function createStepGrant(input: StepGrantMaterial): StepGrant {
  if (!isCanonicalAuthorityDigest(input.quoteDigest) || !isCanonicalAuthorityDigest(input.requestDigest)) {
    throw new Error('step_grant_authority_digest_invalid')
  }
  const material = Object.freeze({
    ...input,
    maximumCost: Object.freeze({ ...input.maximumCost }),
    disclosedDataFields: Object.freeze([...input.disclosedDataFields].sort()),
  })
  return Object.freeze({ ...material, grantDigest: digestStepGrantMaterial(material) })
}

export function isValidStepGrant(grant: StepGrant): boolean {
  return grant.grantDigest === digestStepGrantMaterial(grant)
    && isCanonicalAuthorityDigest(grant.quoteDigest)
    && isCanonicalAuthorityDigest(grant.requestDigest)
    && isCanonicalAuthorityDigest(grant.grantDigest)
    && grant.attempt >= 1
    && Number.isInteger(grant.attempt)
    && grant.issuedAt < grant.expiresAt
    && grant.maximumCost.amountMinor >= 0
    && Number.isInteger(grant.maximumCost.amountMinor)
    && grant.disclosedDataFields.every((field, index, fields) => field.length > 0 && (index === 0 || fields[index - 1]! < field))
}

export function sameStepGrant(left: StepGrant, right: StepGrant): boolean {
  return isValidStepGrant(left) && isValidStepGrant(right)
    && stableStringify(stepGrantHashValue(left)) === stableStringify(stepGrantHashValue(right))
}

function digestStepGrantMaterial(grant: StepGrantMaterial | StepGrant): string {
  return canonicalAuthorityDigest(stepGrantHashValue(grant))
}

function stepGrantHashValue(grant: StepGrantMaterial | StepGrant): StableHashValue {
  return {
    stepGrantId: grant.stepGrantId,
    rootRunId: grant.rootRunId,
    leafRunId: grant.leafRunId,
    quoteId: grant.quoteId,
    quoteDigest: grant.quoteDigest,
    requestDigest: grant.requestDigest,
    bindingId: grant.bindingId,
    nodeId: grant.nodeId,
    capabilityContractId: grant.capabilityContractId,
    maximumCost: grant.maximumCost,
    disclosedDataFields: grant.disclosedDataFields,
    attempt: grant.attempt,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
    enforcementPoint: grant.enforcementPoint,
    incidentEpochDigest: grant.incidentEpochDigest,
  }
}
