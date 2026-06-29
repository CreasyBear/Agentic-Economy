import type { SourceHash } from '@/modules/common/ids'

import type {
  ContactFollowUpAttemptId,
  ContactFollowUpPrivateEvidenceRef,
  ContactFollowUpPrivateEvidenceRefId,
  ContactFollowUpProposalId,
  ContactFollowUpSourceState,
} from './contact-follow-up'

export const ContactFollowUpRetentionClass = 'protected_action_private_evidence' as const
export type ContactFollowUpRetentionClass = typeof ContactFollowUpRetentionClass

export type ContactFollowUpRetentionPolicy = {
  retentionClass: ContactFollowUpRetentionClass
  rawEvidenceDefault: 'discard_after_hash_and_normalization'
  privateEvidenceTtlMs: number
  exportBehavior: 'redacted_refs_with_hashes'
  deleteBehavior: 'redact_private_refs_preserve_tombstone_hashes'
  tombstoneBehavior: 'preserve_source_hashes_and_reason_codes'
  privateEvidenceAccessPolicy: 'owner_admin_operator_only'
}

export const contactFollowUpRetentionPolicy = {
  retentionClass: ContactFollowUpRetentionClass,
  rawEvidenceDefault: 'discard_after_hash_and_normalization',
  privateEvidenceTtlMs: 30 * 24 * 60 * 60 * 1000,
  exportBehavior: 'redacted_refs_with_hashes',
  deleteBehavior: 'redact_private_refs_preserve_tombstone_hashes',
  tombstoneBehavior: 'preserve_source_hashes_and_reason_codes',
  privateEvidenceAccessPolicy: 'owner_admin_operator_only',
} satisfies ContactFollowUpRetentionPolicy

export type RegisterContactFollowUpPrivateEvidenceCommand = {
  id: ContactFollowUpPrivateEvidenceRefId
  proposalId: ContactFollowUpProposalId
  attemptId?: ContactFollowUpAttemptId
  payloadHash: SourceHash
  privatePayloadRef: string
  now: number
}

export type ApplyContactFollowUpRetentionDeleteCommand = {
  proposalId: ContactFollowUpProposalId
  now: number
}

export function registerContactFollowUpPrivateEvidenceRef(
  state: ContactFollowUpSourceState,
  command: RegisterContactFollowUpPrivateEvidenceCommand
): ContactFollowUpSourceState {
  const existing = state.privateEvidenceRefs.find((ref) => ref.id === command.id)
  if (existing !== undefined) {
    return state
  }

  const ref: ContactFollowUpPrivateEvidenceRef = {
    id: command.id,
    proposalId: command.proposalId,
    retentionClass: ContactFollowUpRetentionClass,
    accessPolicy: contactFollowUpRetentionPolicy.privateEvidenceAccessPolicy,
    payloadHash: command.payloadHash,
    privatePayloadRef: command.privatePayloadRef,
    ttlExpiresAt: command.now + contactFollowUpRetentionPolicy.privateEvidenceTtlMs,
    ...(command.attemptId === undefined ? {} : { attemptId: command.attemptId }),
  }

  return { ...state, privateEvidenceRefs: [...state.privateEvidenceRefs, ref] }
}

export function applyContactFollowUpRetentionDelete(
  state: ContactFollowUpSourceState,
  command: ApplyContactFollowUpRetentionDeleteCommand
): ContactFollowUpSourceState {
  return {
    ...state,
    privateEvidenceRefs: state.privateEvidenceRefs.map((ref) => {
      if (ref.proposalId !== command.proposalId) {
        return ref
      }

      return {
        id: ref.id,
        proposalId: ref.proposalId,
        ...(ref.attemptId === undefined ? {} : { attemptId: ref.attemptId }),
        retentionClass: ref.retentionClass,
        accessPolicy: ref.accessPolicy,
        payloadHash: ref.payloadHash,
        ttlExpiresAt: ref.ttlExpiresAt,
        redactedAt: command.now,
      }
    }),
  }
}
