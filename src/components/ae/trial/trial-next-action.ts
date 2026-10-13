export type TrialRefusalCode = 'authentication_required' | 'personal_account_required' | 'verified_email_required' | 'trial_not_approved' | 'trial_expired' | 'trial_already_claimed' | 'trial_authority_invalid' | 'trial_verification_unavailable' | 'trial_code_invalid' | 'trial_code_exhausted'

/** A refusal's remedy is navigation, never purchase or grant authority from a URL. */
export function trialNextAction(code: TrialRefusalCode): Readonly<{ label: string; href: string }> | undefined {
  switch (code) {
    case 'authentication_required': return { label: 'Sign in to activate', href: '/sign-in?redirect=%2Ftrial' }
    case 'personal_account_required': return { label: 'Review Account selection', href: '/owner/settings' }
    case 'verified_email_required': return { label: 'Verify your email', href: '/owner/settings/account/security' }
    case 'trial_already_claimed': return { label: 'View trial credit', href: '/owner/credit' }
    case 'trial_not_approved':
    case 'trial_expired':
    case 'trial_authority_invalid':
    case 'trial_code_exhausted': return { label: 'Contact private support', href: '/support' }
    case 'trial_verification_unavailable':
    case 'trial_code_invalid': return undefined
  }
}
