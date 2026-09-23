import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export const FINANCIAL_SAFE_NO_SECRET =
  'A$0.00 deducted — your balance is safe. No secret was created.'

export function mapValidationDiagnostic(message: string): Rule4Diagnostic {
  return {
    whatHappened: 'Check your settings',
    financialImpact: FINANCIAL_SAFE_NO_SECRET,
    nextStep: message,
  }
}

export function mapIssueErrorDiagnostic(code: string): Rule4Diagnostic {
  switch (code) {
    case 'missing_auth':
      return {
        whatHappened: 'Sign-in required',
        financialImpact: FINANCIAL_SAFE_NO_SECRET,
        nextStep: 'Sign in as the access owner, then try again.',
      }
    case 'invalid_input':
      return {
        whatHappened: 'Could not connect agent',
        financialImpact: FINANCIAL_SAFE_NO_SECRET,
        nextStep: 'Review agent name, environment, and spending limits, then try again.',
      }
    case 'idempotency_conflict':
      return {
        whatHappened: 'Request conflict',
        financialImpact: FINANCIAL_SAFE_NO_SECRET,
        nextStep: 'Wait a moment, then submit again to create a fresh credential.',
      }
    case 'issuance_unavailable':
      return {
        whatHappened: 'Issuance temporarily unavailable',
        financialImpact: FINANCIAL_SAFE_NO_SECRET,
        nextStep: 'Retry in a few seconds. Your settings were not applied.',
      }
    default:
      return {
        whatHappened: 'Could not connect agent',
        financialImpact: FINANCIAL_SAFE_NO_SECRET,
        nextStep: 'Review your settings and try again. Contact support if this persists.',
      }
  }
}

export function mapNetworkDiagnostic(): Rule4Diagnostic {
  return {
    whatHappened: 'Connection interrupted',
    financialImpact: FINANCIAL_SAFE_NO_SECRET,
    nextStep: 'Check your network connection and try again.',
  }
}

export function mapUnexpectedDiagnostic(): Rule4Diagnostic {
  return {
    whatHappened: 'Something went wrong',
    financialImpact: FINANCIAL_SAFE_NO_SECRET,
    nextStep: 'Try again. Contact support if the problem continues.',
  }
}

export function spendingOrderViolationMessage(
  violation: 'per_call_gt_daily' | 'daily_gt_monthly',
): string {
  switch (violation) {
    case 'per_call_gt_daily':
      return 'Per-call limit cannot exceed daily limit.'
    case 'daily_gt_monthly':
      return 'Daily limit cannot exceed monthly limit.'
    default: {
      const _exhaustive: never = violation
      return _exhaustive
    }
  }
}
