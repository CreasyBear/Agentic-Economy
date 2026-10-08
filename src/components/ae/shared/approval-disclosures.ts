import type { CallApprovalDecisionContext } from '@/modules/capability-execution/call-approval-contracts'

type AcceptedApprovalQuote = Extract<CallApprovalDecisionContext['acceptedQuote'], { kind: 'available' }>

/** Accepted declarations only; current registry metadata never supplies these facts. */
export function approvalEffectsLabel(effects: AcceptedApprovalQuote['effects']): string {
  if (effects.length === 0) return 'None declared in the accepted Tool contract; this is not a guarantee of no effects.'
  return effects.map(effect => `${effectClassLabel(effect.class)} · ${reversibilityLabel(effect.reversibility)}`).join('; ')
}

export function approvalDataUseLabel(dataUse: AcceptedApprovalQuote['dataUse']): string {
  if (dataUse.length === 0) return 'None declared in the accepted Tool contract; this is not a guarantee of no disclosure.'
  return dataUse.map(declaration => {
    const field = declaration.inputPointer.slice(1).replaceAll('~1', '/').replaceAll('~0', '~').replaceAll('/', '.')
    const recipient = declaration.recipient.kind === 'candidate_binding'
      ? 'candidate Provider'
      : declaration.recipient.kind === 'selected_binding'
        ? 'selected Provider'
        : `named recipient ${declaration.recipient.recipientId}`
    const purposes = declaration.purposes.map(humanizeIdentifier).join(', ')
    return `${dataClassificationLabel(declaration.classification)} ${field} to ${recipient} during ${declaration.phase} for ${purposes}`
  }).join('; ')
}

function effectClassLabel(effectClass: 'data_release' | 'financial_exposure' | 'external_state_change'): string {
  if (effectClass === 'data_release') return 'Releases data'
  if (effectClass === 'financial_exposure') return 'Creates financial exposure'
  return 'Changes external state'
}

function reversibilityLabel(reversibility: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible'): string {
  if (reversibility === 'not_applicable') return 'reversibility not applicable'
  if (reversibility === 'conditional') return 'reversibility depends on conditions'
  return reversibility
}

function dataClassificationLabel(classification: 'public' | 'personal' | 'sensitive' | 'credential'): string {
  if (classification === 'public') return 'Public data:'
  if (classification === 'personal') return 'Personal data:'
  if (classification === 'sensitive') return 'Sensitive data:'
  return 'Credential:'
}

function humanizeIdentifier(value: string): string {
  return value.replaceAll(/[._-]+/gu, ' ')
}
