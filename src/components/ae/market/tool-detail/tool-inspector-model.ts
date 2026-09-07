import type {
  PublicToolDescriptor,
  PublicToolPrice,
} from '@/modules/capability-supply/public'
import {
  formatToolAuthentication,
  formatPaymentNetwork,
  formatToolReadiness,
} from '@/modules/market/tool-view-model'
import { formatCurrencyAmount } from '@/modules/money/public'
import {
  callableAlternativesHref,
  type SuggestedNextAction,
} from '@/modules/market/suggested-next-action'

export type ToolInspectorModel = Readonly<{
  toolRef: string
  summary: string
  nextAction: SuggestedNextAction
  availabilityPosture: PublicToolDescriptor['availability']['posture']
  readinessLabel: string
  authenticationLabel: string
  paymentNetwork?: string
  decisionLabel: string
  nextActionDescription: string
  totalPrice: string
  lastVerifiedAt?: number
  inputExample?: NonNullable<PublicToolDescriptor['contract']['inputExamples']>[number]
  callInput: string
}>

/**
 * The one presentation projection for an Tool inspection. Full-page and
 * compact inspectors consume this same decision state so readiness, access,
 * price, and the next safe action cannot drift between surfaces.
 */
export function toToolInspectorModel(
  tool: PublicToolDescriptor,
): ToolInspectorModel {
  const callNavigation = tool.navigation.find(({ relation }) => relation === 'call')
  const callable = tool.availability.posture === 'routeable' && callNavigation !== undefined
  const availabilityPosture: ToolInspectorModel['availabilityPosture'] = tool.availability.posture === 'routeable'
    ? callable ? 'routeable' : 'setup_required'
    : tool.availability.posture === 'setup_required'
      ? 'setup_required'
      : 'unavailable'
  const nextAction: SuggestedNextAction = availabilityPosture === 'routeable'
    ? {
        label: 'Tool reference',
        kind: 'copy_command',
        command: tool.toolRef,
      }
    : {
        label: 'Find Tool alternatives',
        kind: 'navigate',
        href: callableAlternativesHref(catalogSummary(tool)),
        warning: 'This Tool is not operational. Choose an operational alternative.',
      }
  const inputExample = tool.contract.inputExamples?.[0]
  const decisionLabel = availabilityPosture === 'routeable' ? 'Operational' : 'Not operational'
  const lastVerifiedAt = tool.availability.observedAt
    ?? tool.commercial.priceEvidence?.observedAt

  return {
    toolRef: tool.toolRef,
    summary: catalogSummary(tool),
    nextAction,
    availabilityPosture,
    readinessLabel: formatToolReadiness(availabilityPosture),
    authenticationLabel: formatToolAuthentication(tool.authentication),
    ...(tool.payment === undefined ? {} : { paymentNetwork: formatPaymentNetwork(tool.payment.network) }),
    decisionLabel,
    nextActionDescription: nextActionDescription(nextAction),
    totalPrice: totalPrice(tool),
    ...(lastVerifiedAt === undefined ? {} : { lastVerifiedAt }),
    ...(inputExample === undefined ? {} : { inputExample }),
    callInput: inputExample === undefined
      ? '"$AE_INPUT_JSON"'
      : `'${JSON.stringify(inputExample.input).replaceAll("'", "'\\''")}'`,
  }
}

export function nextActionCode(model: ToolInspectorModel): string | undefined {
  return model.nextAction.command
}

export function toolLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function nextActionDescription(nextAction: SuggestedNextAction): string {
  if (nextAction.warning !== undefined) return nextAction.warning
  if (nextAction.label === 'Tool reference') {
    return 'Paste this reference into your existing agent client. It will inspect exact terms and request access only when needed.'
  }
  return 'This Tool cannot be called from AE right now. Browse the catalog for another route.'
}

function catalogSummary(tool: PublicToolDescriptor): string {
  const summary = tool.summary.trim()
  return summary === '' ? tool.offering.summary : summary
}

function formatPrice(price: PublicToolPrice): string {
  if (price.kind === 'on_request') return 'On request'
  if (price.kind === 'fixed') return formatCurrencyAmount(price.amount)
  return `${formatCurrencyAmount(price.minimum)} to ${formatCurrencyAmount(price.maximum)}`
}

function totalPrice(tool: PublicToolDescriptor): string {
  return tool.commercial.priceBreakdown === undefined
    ? formatPrice(tool.commercial.price)
    : formatCurrencyAmount(tool.commercial.priceBreakdown.totalBuyerAuthorization)
}
