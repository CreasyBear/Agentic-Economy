import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export const FINANCIAL_NO_UPDATE = 'A$0.00 affected — profile was not updated.'

export const SAVE_FAILURE_DIAGNOSTIC: Rule4Diagnostic = {
  whatHappened: 'Could not save provider profile.',
  financialImpact: FINANCIAL_NO_UPDATE,
  nextStep: 'Please check connection and try again.',
}

export type ProviderIdentityFieldId = 'name' | 'website'

export type ProviderIdentityValidationIssue = Readonly<{
  field: ProviderIdentityFieldId
  diagnostic: Rule4Diagnostic
}>

function invalidHttpsWebsiteDiagnostic(): Rule4Diagnostic {
  return {
    whatHappened: 'Enter a valid HTTPS provider website.',
    financialImpact: FINANCIAL_NO_UPDATE,
    nextStep: 'Use a full https:// origin, for example https://api.acme.example.com.',
  }
}

export function profileValidationIssue(
  trimmedName: string,
  trimmedWebsite: string,
): ProviderIdentityValidationIssue | undefined {
  if (trimmedName.length === 0) {
    return {
      field: 'name',
      diagnostic: {
        whatHappened: 'Enter your supplier / brand name.',
        financialImpact: FINANCIAL_NO_UPDATE,
        nextStep: 'Enter the public name shown on Tool cards.',
      },
    }
  }

  try {
    const parsedUrl = new URL(trimmedWebsite)
    if (parsedUrl.protocol !== 'https:') {
      return { field: 'website', diagnostic: invalidHttpsWebsiteDiagnostic() }
    }
  } catch (cause) {
    void cause
    return { field: 'website', diagnostic: invalidHttpsWebsiteDiagnostic() }
  }

  return undefined
}

export function diagnosticForProfileValidation(
  trimmedName: string,
  trimmedWebsite: string,
): Rule4Diagnostic | undefined {
  return profileValidationIssue(trimmedName, trimmedWebsite)?.diagnostic
}
