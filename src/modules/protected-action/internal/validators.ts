import {
  ContactFollowUpActionSlug,
  ContactFollowUpAttemptOutcomeValues,
  ContactFollowUpDecisionValues,
  ContactFollowUpParameterKeyValues,
  ContactFollowUpPolicyKindValues,
} from './contact-follow-up'
import type {
  ContactFollowUpAttemptOutcome,
  ContactFollowUpDecision,
  ContactFollowUpParameterKey,
  ContactFollowUpPolicyKind,
} from './contact-follow-up'

export type ContactFollowUpValidationResult =
  | { valid: true }
  | {
      valid: false
      reason:
        | 'selected_slug_only'
        | 'parameter_not_allowed'
        | 'decision_not_allowed'
        | 'policy_not_allowed'
        | 'attempt_outcome_not_allowed'
    }

export function validateContactFollowUpSlug(slug: string): ContactFollowUpValidationResult {
  return slug === ContactFollowUpActionSlug ? { valid: true } : { valid: false, reason: 'selected_slug_only' }
}

export function isContactFollowUpParameterKey(value: string): value is ContactFollowUpParameterKey {
  return ContactFollowUpParameterKeyValues.includes(value as ContactFollowUpParameterKey)
}

export function isContactFollowUpDecision(value: string): value is ContactFollowUpDecision {
  return ContactFollowUpDecisionValues.includes(value as ContactFollowUpDecision)
}

export function isContactFollowUpPolicyKind(value: string): value is ContactFollowUpPolicyKind {
  return ContactFollowUpPolicyKindValues.includes(value as ContactFollowUpPolicyKind)
}

export function isContactFollowUpAttemptOutcome(value: string): value is ContactFollowUpAttemptOutcome {
  return ContactFollowUpAttemptOutcomeValues.includes(value as ContactFollowUpAttemptOutcome)
}
