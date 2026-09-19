import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import type {
  AgentSpendingLimitsReadResult,
  AgentSpendingLimitsResult,
} from '@/modules/agent-access/spending-policy-update'

export const FINANCIAL_SAFE_LIMITS_UNCHANGED =
  'A$0.00 deducted — your balance is safe. Current limits were not changed.'

export function mapUpdateConflictDiagnostic(
  code: Extract<AgentSpendingLimitsResult, { kind: 'conflict' }>['code'],
): Rule4Diagnostic {
  switch (code) {
    case 'revision_conflict':
      return {
        whatHappened: 'Policy changed since you opened it',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Reload the agent, then apply your limits again.',
      }
    case 'idempotency_conflict':
      return {
        whatHappened: 'This save collided with another request',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Wait a moment, then save again.',
      }
    case 'credential_replacement_pending':
      return {
        whatHappened: 'A credential replacement is in progress',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Finish or wait for replacement, then edit limits.',
      }
    case 'policy_invalid':
      return {
        whatHappened: 'Those limits are not allowed',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Check per-call ≤ daily ≤ monthly and try again.',
      }
    case 'agent_not_found':
      return {
        whatHappened: 'This agent is no longer available',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Close the sheet and refresh the directory.',
      }
    case 'account_ownership_required':
      return {
        whatHappened: 'You cannot change this agent’s policy',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Switch to the workspace that owns this agent.',
      }
    case 'authority_unavailable':
      return {
        whatHappened: 'Authority cannot be verified',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Retry in a few seconds. Limits were not changed.',
      }
    default: {
      const _exhaustive: never = code
      return {
        whatHappened: 'Could not update spending limits',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Try again in a moment.',
      }
    }
  }
}

export function mapUpdateRefusedDiagnostic(
  code: Extract<AgentSpendingLimitsResult, { kind: 'refused' }>['code'],
): Rule4Diagnostic {
  switch (code) {
    case 'authentication_required':
      return {
        whatHappened: 'Sign-in required',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Sign in as the access owner, then try again.',
      }
    case 'source_unavailable':
      return {
        whatHappened: 'Spending policy is temporarily unavailable',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Try again in a moment. Nothing was written.',
      }
    default: {
      const _exhaustive: never = code
      return {
        whatHappened: 'Update refused',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Try again in a moment.',
      }
    }
  }
}

export function mapReadRefusedDiagnostic(
  code: Extract<AgentSpendingLimitsReadResult, { kind: 'refused' }>['code'],
): Rule4Diagnostic {
  switch (code) {
    case 'source_unavailable':
      return {
        whatHappened: 'Spending limits are temporarily unavailable',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Try again in a moment. Nothing was written.',
      }
    case 'authentication_required':
      return {
        whatHappened: 'Sign-in required',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Sign in as the access owner, then try again.',
      }
    case 'account_ownership_required':
      return {
        whatHappened: 'You cannot change this agent’s policy',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Switch to the workspace that owns this agent.',
      }
    case 'agent_not_found':
      return {
        whatHappened: 'This agent is no longer available',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Close the sheet and refresh the directory.',
      }
    case 'authority_unavailable':
      return {
        whatHappened: 'Authority cannot be verified',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Retry in a few seconds. Limits were not changed.',
      }
    default: {
      const _exhaustive: never = code
      return {
        whatHappened: 'Cannot verify spending policy',
        financialImpact: FINANCIAL_SAFE_LIMITS_UNCHANGED,
        nextStep: 'Try again in a moment.',
      }
    }
  }
}
