import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { isValidAbn } from '@/modules/money/public'

export const FINANCIAL_NO_UPDATE = 'A$0.00 affected — profile was not updated.'

export const SAVE_FAILURE_DIAGNOSTIC: Rule4Diagnostic = {
  whatHappened: 'Could not save provider profile.',
  financialImpact: FINANCIAL_NO_UPDATE,
  nextStep: 'Please check connection and try again.',
}

function invalidHttpsWebsiteDiagnostic(): Rule4Diagnostic {
  return {
    whatHappened: 'Enter a valid HTTPS provider website.',
    financialImpact: FINANCIAL_NO_UPDATE,
    nextStep: 'Use a full https:// origin, for example https://api.acme.example.com.',
  }
}

export function diagnosticForProfileValidation(
  trimmedName: string,
  trimmedWebsite: string,
  cleanAbn: string,
): Rule4Diagnostic | undefined {
  if (trimmedName.length === 0) {
    return {
      whatHappened: 'Enter your supplier / brand name.',
      financialImpact: FINANCIAL_NO_UPDATE,
      nextStep: 'Enter the public name shown on Tool cards and invoices.',
    }
  }

  try {
    const parsedUrl = new URL(trimmedWebsite)
    if (parsedUrl.protocol !== 'https:') {
      return invalidHttpsWebsiteDiagnostic()
    }
  } catch (cause) {
    void cause
    return invalidHttpsWebsiteDiagnostic()
  }

  if (!isValidAbn(cleanAbn)) {
    return {
      whatHappened: 'Invalid Australian Business Number (ABN).',
      financialImpact: FINANCIAL_NO_UPDATE,
      nextStep: 'Enter an 11-digit ABN with valid ATO checksum or check ABN Lookup.',
    }
  }

  return undefined
}
