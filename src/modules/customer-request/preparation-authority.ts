import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import { stableUnique } from '@/modules/common/stable-unique'

type Awaitable<Value> = Value | Promise<Value>

export function createProtectedProjectionCommitter(secret: string) {
  if (new TextEncoder().encode(secret).byteLength < 32) throw new Error('preparation_projection_commitment_secret_too_short')
  return (input: Readonly<Record<string, string | number | boolean>>): string => {
    return `hmac-sha256:${bytesToHex(hmac(sha256, secret, stableStringify(input)))}`
  }
}

export type PreparationAuthorityRefusalReason =
  | 'authority_evidence_invalid'
  | 'authority_signer_mismatch'
  | 'authority_principal_mismatch'
  | 'authority_agent_mismatch'
  | 'authority_request_mismatch'
  | 'authority_request_revision_mismatch'
  | 'authority_field_denied'
  | 'authority_recipient_denied'
  | 'authority_purpose_denied'
  | 'authority_expired'
  | 'authority_revoked'
  | 'authority_not_yet_valid'
  | 'authority_state_conflict'
  | 'authority_recipient_capacity_exceeded'
  | 'authority_exposure_capacity_exceeded'
  | 'authority_operation_capacity_exceeded'
  | 'authority_allocation_conflict'

export type VerifiedPreparationAuthority = Readonly<{
  authorityId: string
  authorityVersion: number
  authorityDigest: string
  principalId: string
  delegatedAgentId: string
  requestId: string
  requestRevision: number
  mode: 'single_use' | 'standing'
  status: 'active' | 'revoked'
  verification: Readonly<{
    evidenceRef: string
    issuerId: string
    signerId: string
    keyId: string
  }>
  permittedFields: readonly string[]
  permittedRecipientKinds: readonly PreparationRecipient['kind'][]
  permittedRecipientBindingIds: readonly string[]
  permittedPurposes: readonly string[]
  maximumRecipients: number
  maximumExposures: number
  maximumOperations: number
  grantedAt: number
  expiresAt: number
}>

export type PreparationAuthorityVerifier = Readonly<{
  verify: (input: Readonly<{
    authorityEvidenceRef: string
    requestId: string
    requestRevision: number
  }>) => Awaitable<
    | Readonly<{ kind: 'verified'; authority: VerifiedPreparationAuthority }>
    | Readonly<{ kind: 'refused'; reason: PreparationAuthorityRefusalReason }>
  >
}>

export type PreparationAuthorityEvidence = Readonly<{
  evidenceRef: string
  issuerId: string
  signerId: string
  keyId: string
  authority: VerifiedPreparationAuthority
  signature: string
}>

export function preparationAuthorityDigest(
  authority: Omit<VerifiedPreparationAuthority, 'authorityDigest' | 'status' | 'verification'>,
): string {
  return canonicalDigest({
    authorityId: authority.authorityId, authorityVersion: authority.authorityVersion,
    principalId: authority.principalId, delegatedAgentId: authority.delegatedAgentId,
    requestId: authority.requestId, requestRevision: authority.requestRevision, mode: authority.mode,
    permittedFields: uniqueSorted(authority.permittedFields),
    permittedRecipientKinds: uniqueSorted(authority.permittedRecipientKinds),
    permittedRecipientBindingIds: uniqueSorted(authority.permittedRecipientBindingIds),
    permittedPurposes: uniqueSorted(authority.permittedPurposes),
    maximumRecipients: authority.maximumRecipients, maximumExposures: authority.maximumExposures,
    maximumOperations: authority.maximumOperations, grantedAt: authority.grantedAt, expiresAt: authority.expiresAt,
  })
}

export function createPreparationAuthorityVerifier(dependencies: Readonly<{
  evidenceReader: Readonly<{ get: (evidenceRef: string) => Awaitable<PreparationAuthorityEvidence | undefined> }>
  trustedIssuers: Readonly<{
    isTrusted: (input: Readonly<{ issuerId: string; signerId: string; keyId: string }>) => boolean
  }>
  signatures: Readonly<{ verify: (input: Readonly<{
    issuerId: string
    signerId: string
    keyId: string
    signature: string
    material: Readonly<{ evidenceRef: string; authorityDigest: string; keyId: string }>
  }>) => Awaitable<boolean> }>
}>): PreparationAuthorityVerifier {
  return Object.freeze({
    verify: async (input) => {
      const evidence = await dependencies.evidenceReader.get(input.authorityEvidenceRef)
      if (evidence === undefined || evidence.evidenceRef !== input.authorityEvidenceRef) {
        return { kind: 'refused' as const, reason: 'authority_evidence_invalid' as const }
      }
      if (!dependencies.trustedIssuers.isTrusted({
        issuerId: evidence.issuerId, signerId: evidence.signerId, keyId: evidence.keyId,
      })) {
        return { kind: 'refused' as const, reason: 'authority_signer_mismatch' as const }
      }
      const { authorityDigest, status: _status, verification: _verification, ...authorityMaterial } = evidence.authority
      if (preparationAuthorityDigest(authorityMaterial) !== authorityDigest) {
        return { kind: 'refused' as const, reason: 'authority_evidence_invalid' as const }
      }
      if (!await dependencies.signatures.verify({
        issuerId: evidence.issuerId,
        signerId: evidence.signerId,
        keyId: evidence.keyId,
        signature: evidence.signature,
        material: {
          evidenceRef: evidence.evidenceRef, authorityDigest: evidence.authority.authorityDigest, keyId: evidence.keyId,
        },
      })) return { kind: 'refused' as const, reason: 'authority_evidence_invalid' as const }
      return {
        kind: 'verified' as const,
        authority: {
          ...evidence.authority,
          verification: {
            evidenceRef: evidence.evidenceRef, issuerId: evidence.issuerId,
            signerId: evidence.signerId, keyId: evidence.keyId,
          },
        },
      }
    },
  })
}

export type PreparationRecipient = Readonly<{
  nodeId: string
  bindingId: string
  name: string
  kind: 'candidate_provider' | 'selected_provider' | 'offer_issuer' | 'named_recipient'
}>

export type PreparationDisclosureCommand = Readonly<{
  operationKey: string
  authorityUseKey: string
  authorityEvidenceRef: string
  principalId: string
  delegatedAgentId: string
  requestId: string
  requestRevision: number
  planRevisionId: string
  actionId: string
  capabilityContractId: string
  resolvedInputDigest: string
  protectedProjectionCommitment: string
  recipient: PreparationRecipient
  purpose: string
  purposeLabel: string
  fields: readonly string[]
  fieldCategories: readonly Readonly<{ field: string; label: string }>[]
  protectedValues: Readonly<Record<string, string | number | boolean>>
}>

export type PreparationDisclosureAllocation = Readonly<{
  allocationId: string
  operationKey: string
  authorityUseKey: string
  authorityId: string
  authorityVersion: number
  authorityDigest: string
  requestId: string
  requestRevision: number
  planRevisionId: string
  actionId: string
  capabilityContractId: string
  allocationDigest: string
  recipient: PreparationRecipient
  purpose: string
  purposeLabel: string
  fields: readonly string[]
  fieldCategories: readonly Readonly<{ field: string; label: string }>[]
  disposition: 'allocated' | 'released' | 'not_released' | 'uncertain'
  allocatedAt: number
  resolvedAt?: number
  providerEvidenceRef?: string
  uncertainAt?: number
  reconciledAt?: number
}>

export type PreparationDisclosureStore = Readonly<{
  get: (allocationId: string) => Awaitable<PreparationDisclosureAllocation | undefined>
  allocate: (input: Readonly<{
    authority: VerifiedPreparationAuthority
    command: PreparationDisclosureCommand
    now: number
  }>) => Awaitable<
    | Readonly<{ kind: 'allocated'; allocation: PreparationDisclosureAllocation }>
    | Readonly<{ kind: 'refused'; reason: PreparationAuthorityRefusalReason }>
  >
  resolve: (input: Readonly<{
    allocationId: string
    disposition: 'released' | 'not_released' | 'uncertain'
    resolvedAt: number
    providerEvidenceRef?: string
  }>) => Awaitable<PreparationDisclosureAllocation>
  reconcileReleased: (input: Readonly<{
    allocationId: string
    providerEvidenceRef: string
    reconciledAt: number
  }>) => Awaitable<PreparationDisclosureAllocation>
  authorizeRelease: (input: Readonly<{ allocationId: string; now: number }>) => Awaitable<
    | Readonly<{ kind: 'authorized'; allocation: PreparationDisclosureAllocation }>
    | Readonly<{ kind: 'refused'; reason: 'authority_revoked' | 'authority_expired' | 'authority_state_conflict' }>
  >
}>

export type PreparationDisclosureResult =
  | Readonly<{
    kind: 'released'; providerEvidenceRef: string; allocationId: string; disposition: 'released'; releasedAt: number
  }>
  | Readonly<{ kind: 'uncertain'; allocationId: string; disposition: 'uncertain'; nextAction: string }>
  | Readonly<{ kind: 'refused'; reason: PreparationAuthorityRefusalReason; nextAction: string }>

export function createInMemoryPreparationDisclosureStore(
  _authorities: readonly VerifiedPreparationAuthority[] = [],
): PreparationDisclosureStore {
  const allocations = new Map<string, PreparationDisclosureAllocation>()
  const operations = new Map<string, string>()
  const authorityStates = new Map(_authorities.map((authority) => [authority.authorityId, {
    authority,
    recipients: new Set<string>(),
    exposures: new Set<string>(),
    operations: new Set<string>(),
  }]))
  return Object.freeze({
    get: (allocationId) => allocations.get(allocationId),
    allocate: (input) => {
      const allocationDigest = canonicalDigest(allocationMaterial(input.authority, input.command))
      const existingId = operations.get(input.command.operationKey)
      if (existingId !== undefined) {
        const existing = allocations.get(existingId)
        if (existing === undefined) throw new Error('preparation_allocation_missing')
        return existing.allocationDigest === allocationDigest
          ? { kind: 'allocated' as const, allocation: existing }
          : { kind: 'refused' as const, reason: 'authority_allocation_conflict' as const }
      }
      const state = authorityStates.get(input.authority.authorityId)
      if (state === undefined || state.authority.authorityVersion !== input.authority.authorityVersion
        || state.authority.authorityDigest !== input.authority.authorityDigest || state.authority.status !== 'active'
        || state.authority.expiresAt <= input.now) {
        return { kind: 'refused' as const, reason: 'authority_state_conflict' as const }
      }
      const isNewRecipient = !state.recipients.has(input.command.recipient.bindingId)
      const exposureKeys = stableUnique(input.command.fields).map((field) => [
        input.command.recipient.bindingId, input.command.purpose, field,
      ].join('\u001f'))
      const newExposureCount = exposureKeys.filter((key) => !state.exposures.has(key)).length
      if (isNewRecipient && state.recipients.size >= state.authority.maximumRecipients) {
        return { kind: 'refused' as const, reason: 'authority_recipient_capacity_exceeded' as const }
      }
      if (state.exposures.size + newExposureCount > state.authority.maximumExposures) {
        return { kind: 'refused' as const, reason: 'authority_exposure_capacity_exceeded' as const }
      }
      const isNewAuthorityUse = !state.operations.has(input.command.authorityUseKey)
      if (isNewAuthorityUse && state.operations.size >= state.authority.maximumOperations) {
        return { kind: 'refused' as const, reason: 'authority_operation_capacity_exceeded' as const }
      }
      const allocation = createPreparationDisclosureAllocation(input.authority, input.command, input.now)
      allocations.set(allocation.allocationId, allocation)
      operations.set(input.command.operationKey, allocation.allocationId)
      state.recipients.add(input.command.recipient.bindingId)
      exposureKeys.forEach((key) => state.exposures.add(key))
      state.operations.add(input.command.authorityUseKey)
      return { kind: 'allocated' as const, allocation }
    },
    resolve: (input) => {
      const current = allocations.get(input.allocationId)
      if (current === undefined) throw new Error('preparation_allocation_not_found')
      const resolved = Object.freeze({
        ...current,
        disposition: input.disposition,
        resolvedAt: input.resolvedAt,
        ...(input.disposition === 'uncertain' ? { uncertainAt: input.resolvedAt } : {}),
        ...(input.providerEvidenceRef === undefined ? {} : { providerEvidenceRef: input.providerEvidenceRef }),
      })
      allocations.set(input.allocationId, resolved)
      return resolved
    },
    reconcileReleased: (input) => {
      const current = allocations.get(input.allocationId)
      if (current === undefined) throw new Error('preparation_allocation_not_found')
      if (input.providerEvidenceRef.trim().length === 0) throw new Error('preparation_reconciliation_evidence_required')
      if (current.disposition === 'released') {
        if (current.providerEvidenceRef !== input.providerEvidenceRef) throw new Error('preparation_allocation_reconciliation_conflict')
        return current
      }
      if (current.disposition !== 'uncertain') throw new Error('preparation_allocation_not_uncertain')
      const reconciled = Object.freeze({
        ...current, disposition: 'released' as const, providerEvidenceRef: input.providerEvidenceRef,
        resolvedAt: input.reconciledAt, reconciledAt: input.reconciledAt,
      })
      allocations.set(input.allocationId, reconciled)
      return reconciled
    },
    authorizeRelease: (input) => {
      const allocation = allocations.get(input.allocationId)
      if (allocation === undefined || allocation.disposition !== 'allocated') {
        return { kind: 'refused' as const, reason: 'authority_state_conflict' as const }
      }
      const state = authorityStates.get(allocation.authorityId)
      if (state === undefined || state.authority.authorityVersion !== allocation.authorityVersion
        || state.authority.authorityDigest !== allocation.authorityDigest) {
        return { kind: 'refused' as const, reason: 'authority_state_conflict' as const }
      }
      if (state.authority.status !== 'active') return { kind: 'refused' as const, reason: 'authority_revoked' as const }
      if (state.authority.expiresAt <= input.now) return { kind: 'refused' as const, reason: 'authority_expired' as const }
      return { kind: 'authorized' as const, allocation }
    },
  })
}

export function createPreparationDisclosureAllocation(
  authority: VerifiedPreparationAuthority,
  command: PreparationDisclosureCommand,
  now: number,
): PreparationDisclosureAllocation {
  return Object.freeze({
    allocationId: `preparation-allocation:${canonicalDigest({ authorityId: authority.authorityId, operationKey: command.operationKey })}`,
    operationKey: command.operationKey,
    authorityUseKey: command.authorityUseKey,
    authorityId: authority.authorityId,
    authorityVersion: authority.authorityVersion,
    authorityDigest: authority.authorityDigest,
    requestId: command.requestId,
    requestRevision: command.requestRevision,
    planRevisionId: command.planRevisionId,
    actionId: command.actionId,
    capabilityContractId: command.capabilityContractId,
    allocationDigest: canonicalDigest(allocationMaterial(authority, command)),
    recipient: command.recipient,
    purpose: command.purpose,
    purposeLabel: command.purposeLabel,
    fields: Object.freeze(uniqueSorted(command.fields)),
    fieldCategories: Object.freeze(command.fieldCategories.map((item) => Object.freeze({ ...item }))),
    disposition: 'allocated',
    allocatedAt: now,
  })
}

export async function releasePreparationDisclosure(
  command: PreparationDisclosureCommand,
  dependencies: Readonly<{
    verifier: PreparationAuthorityVerifier
    store: PreparationDisclosureStore
    now: () => number
    release: (input: Readonly<{
      allocationId: string
      recipient: PreparationRecipient
      purpose: string
      protectedValues: Readonly<Record<string, string | number | boolean>>
    }>) => Awaitable<Readonly<{ kind: 'released'; providerEvidenceRef: string }>>
  }>,
): Promise<PreparationDisclosureResult> {
  const verification = await dependencies.verifier.verify({
    authorityEvidenceRef: command.authorityEvidenceRef,
    requestId: command.requestId,
    requestRevision: command.requestRevision,
  })
  if (verification.kind === 'refused') {
    return Object.freeze({
      kind: 'refused',
      reason: verification.reason,
      nextAction: 'Ask the customer to authorize this data sharing request again.',
    })
  }
  if (verification.authority.principalId !== command.principalId) {
    return Object.freeze({
      kind: 'refused',
      reason: 'authority_principal_mismatch',
      nextAction: 'Use permission granted by the customer who owns this request.',
    })
  }
  const scopeRefusal = validateAuthorityScope(verification.authority, command, dependencies.now())
  if (scopeRefusal !== undefined) {
    return Object.freeze({ kind: 'refused', reason: scopeRefusal, nextAction: nextActionFor(scopeRefusal) })
  }
  const allocation = await dependencies.store.allocate({ authority: verification.authority, command, now: dependencies.now() })
  if (allocation.kind === 'refused') {
    return Object.freeze({
      kind: 'refused', reason: allocation.reason, nextAction: nextActionFor(allocation.reason),
    })
  }
  if (allocation.allocation.disposition === 'released' && allocation.allocation.providerEvidenceRef !== undefined) {
    return Object.freeze({
      kind: 'released', providerEvidenceRef: allocation.allocation.providerEvidenceRef,
      allocationId: allocation.allocation.allocationId, disposition: 'released',
      releasedAt: allocation.allocation.resolvedAt ?? allocation.allocation.allocatedAt,
    })
  }
  if (allocation.allocation.disposition === 'uncertain') return uncertainResult(allocation.allocation)
  const releaseAuthorization = await dependencies.store.authorizeRelease({
    allocationId: allocation.allocation.allocationId,
    now: dependencies.now(),
  })
  if (releaseAuthorization.kind === 'refused') {
    return Object.freeze({
      kind: 'refused', reason: releaseAuthorization.reason, nextAction: nextActionFor(releaseAuthorization.reason),
    })
  }
  let released: Readonly<{ kind: 'released'; providerEvidenceRef: string }>
  try {
    released = await dependencies.release({
      allocationId: allocation.allocation.allocationId,
      recipient: releaseAuthorization.allocation.recipient,
      purpose: releaseAuthorization.allocation.purpose,
      protectedValues: command.protectedValues,
    })
  } catch {
    const uncertain = await dependencies.store.resolve({
      allocationId: allocation.allocation.allocationId,
      disposition: 'uncertain',
      resolvedAt: dependencies.now(),
    })
    return uncertainResult(uncertain)
  }
  const releasedAt = dependencies.now()
  await dependencies.store.resolve({
    allocationId: allocation.allocation.allocationId,
    disposition: 'released',
    providerEvidenceRef: released.providerEvidenceRef,
    resolvedAt: releasedAt,
  })
  return Object.freeze({
    kind: 'released',
    providerEvidenceRef: released.providerEvidenceRef,
    allocationId: allocation.allocation.allocationId,
    disposition: 'released',
    releasedAt,
  })
}

function uncertainResult(allocation: PreparationDisclosureAllocation): Extract<PreparationDisclosureResult, { kind: 'uncertain' }> {
  return Object.freeze({
    kind: 'uncertain', allocationId: allocation.allocationId, disposition: 'uncertain',
    nextAction: `Wait while AE checks whether ${allocation.recipient.name} received the data.`,
  })
}

function allocationMaterial(authority: VerifiedPreparationAuthority, command: PreparationDisclosureCommand) {
  return {
    authorityId: authority.authorityId,
    authorityVersion: authority.authorityVersion,
    authorityDigest: authority.authorityDigest,
    operationKey: command.operationKey,
    authorityUseKey: command.authorityUseKey,
    requestId: command.requestId,
    requestRevision: command.requestRevision,
    planRevisionId: command.planRevisionId,
    actionId: command.actionId,
    capabilityContractId: command.capabilityContractId,
    resolvedInputDigest: command.resolvedInputDigest,
    protectedProjectionCommitment: command.protectedProjectionCommitment,
    recipientBindingId: command.recipient.bindingId,
    recipientNodeId: command.recipient.nodeId,
    recipientName: command.recipient.name,
    recipientKind: command.recipient.kind,
    purpose: command.purpose,
    purposeLabel: command.purposeLabel,
    fields: uniqueSorted(command.fields),
    fieldCategories: command.fieldCategories.map((item) => ({ ...item })),
  }
}

function validateAuthorityScope(
  authority: VerifiedPreparationAuthority,
  command: PreparationDisclosureCommand,
  now: number,
): PreparationAuthorityRefusalReason | undefined {
  const { authorityDigest, status: _status, verification: _verification, ...authorityMaterial } = authority
  if (preparationAuthorityDigest(authorityMaterial) !== authorityDigest
    || (authority.mode === 'single_use' && authority.maximumOperations !== 1)) return 'authority_evidence_invalid'
  if (authority.delegatedAgentId !== command.delegatedAgentId) return 'authority_agent_mismatch'
  if (authority.requestId !== command.requestId) return 'authority_request_mismatch'
  if (authority.requestRevision !== command.requestRevision) return 'authority_request_revision_mismatch'
  if (authority.status !== 'active') return 'authority_revoked'
  if (authority.grantedAt > now) return 'authority_not_yet_valid'
  if (authority.expiresAt <= now) return 'authority_expired'
  const fields = stableUnique(command.fields)
  const permittedFields = new Set(authority.permittedFields)
  if (fields.length === 0 || fields.some((field) => !permittedFields.has(field))) return 'authority_field_denied'
  const protectedValueFields = Object.keys(command.protectedValues).sort()
  const categoryFields = command.fieldCategories.map((item) => item.field).sort()
  if (JSON.stringify([...fields].sort()) !== JSON.stringify(protectedValueFields)
    || JSON.stringify([...fields].sort()) !== JSON.stringify(categoryFields)
    || command.purposeLabel.trim().length === 0 || command.fieldCategories.some((item) => item.label.trim().length === 0)
    || !/^hmac-sha256:[a-f0-9]{64}$/.test(command.protectedProjectionCommitment)) return 'authority_field_denied'
  if (!authority.permittedRecipientKinds.includes(command.recipient.kind)
    || !authority.permittedRecipientBindingIds.includes(command.recipient.bindingId)) return 'authority_recipient_denied'
  if (!authority.permittedPurposes.includes(command.purpose)) return 'authority_purpose_denied'
  return undefined
}

function nextActionFor(reason: PreparationAuthorityRefusalReason): string {
  switch (reason) {
    case 'authority_evidence_invalid': return 'Ask the customer to authorize this data sharing request again.'
    case 'authority_signer_mismatch': return 'Use permission issued by a trusted customer authority.'
    case 'authority_principal_mismatch': return 'Use permission granted by the customer who owns this request.'
    case 'authority_agent_mismatch': return 'Use the delegated agent named by the customer permission.'
    case 'authority_request_mismatch':
    case 'authority_request_revision_mismatch': return 'Ask the customer to authorize sharing for the current request.'
    case 'authority_field_denied': return 'Ask permission for the additional data category or remove it from the comparison.'
    case 'authority_recipient_denied': return 'Use an authorized connected business or ask permission to include this business.'
    case 'authority_purpose_denied': return 'Use the authorized purpose or ask the customer for new permission.'
    case 'authority_expired': return 'Ask the customer to renew permission before contacting a business.'
    case 'authority_revoked': return 'Ask the customer for new permission before contacting another business.'
    case 'authority_not_yet_valid': return 'Wait until the customer permission becomes active.'
    case 'authority_state_conflict': return 'Refresh the customer permission before contacting a business.'
    case 'authority_recipient_capacity_exceeded': return 'Reduce the businesses contacted or ask the customer to raise the sharing limit.'
    case 'authority_exposure_capacity_exceeded': return 'Reduce the data sharing requested or ask the customer for a new permission.'
    case 'authority_operation_capacity_exceeded': return 'Ask the customer for permission to start another comparison.'
    case 'authority_allocation_conflict': return 'Start a new authorized preparation instead of changing an existing retry.'
  }
}
