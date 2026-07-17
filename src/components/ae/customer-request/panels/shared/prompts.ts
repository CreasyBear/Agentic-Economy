import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import type { CustomerClarification } from '../../workspace-types'

export function customerClarificationPrompt(clarification: CustomerClarification): string {
  return customerFacingAeTurn(clarification.prompt)
}
export function customerFacingAeTurn(text: string): string {
  const prompt = text.trim()
  return prompt.endsWith('?') ? prompt : 'What else should AE know to find the right options?'
}
export function statusLabel(state: CustomerRequestView['state']): string {
  if (state === 'ready_to_compare') return 'Ready to compare'
  if (state === 'needs_information') return 'More information needed'
  if (state === 'preparing_options') return 'Checking connected businesses'
  if (state === 'needs_attention') return 'Needs attention'
  if (state === 'outcome_unknown') return 'Still confirming'
  if (state === 'completed') return 'Completed'
  if (state === 'failed') return 'Could not be completed'
  if (state === 'no_options') return 'No matching options'
  if (state === 'needs_authorization') return 'Permission needed'
  return state === 'options_ready' ? 'Available options' : 'Not supported yet'
}
