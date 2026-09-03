import { normalizeAgentAccessOperationSelection, type AgentAccessOperationAccess } from './policy'

export type AgentConsentTarget = Readonly<{
  principalRef: string
  principalRevision: number
  displayName: string
}>

export type AgentConsentDetails = Readonly<{
  state: 'ready' | 'outcome_unknown' | 'succeeded'
  grantRef?: string
  grantRevision?: number
  flow?: 'device_code' | 'authorization_code'
  clientName?: string
  mode?: string
  accessProfile?: 'market' | 'supplier'
  environment?: 'sandbox' | 'production'
  operationAccess?: AgentAccessOperationAccess
  operationRefs?: readonly string[]
  expiresInSeconds?: number
  accessSummary?: string
  agentTargets: readonly AgentConsentTarget[]
  agentTargetsNextCursor?: string
  agentTargetsUnavailable: boolean
  reconnectPrincipalRef?: string
  reconnectAmbiguous?: boolean
}>

export function readAgentConsentDetails(html: string): AgentConsentDetails {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const consent = document.querySelector<HTMLElement>('[data-ae-consent]')
  const state = consent?.dataset.aeConsentState === 'outcome_unknown'
    ? 'outcome_unknown'
    : consent?.dataset.aeConsentState === 'succeeded'
      ? 'succeeded'
      : 'ready'
  const grantRef = consent?.dataset.grantRef
  const grantRevisionValue = Number(consent?.dataset.grantRevision)
  const grantRevision = Number.isSafeInteger(grantRevisionValue) && grantRevisionValue > 0
    ? grantRevisionValue
    : undefined
  const flow = consent?.dataset.flow
  const clientName = consent?.dataset.clientName
  const mode = consent?.dataset.authorityMode
  const accessProfile = consent?.dataset.accessProfile
  const environment = consent?.dataset.environment
  const operationAccessValue = consent?.dataset.operationAccess
  let operationSelection: ReturnType<typeof normalizeAgentAccessOperationSelection>
  try {
    const operationRefs: unknown = JSON.parse(decodeURIComponent(consent?.dataset.operationRefs ?? ''))
    operationSelection = (operationAccessValue === 'all_admitted' || operationAccessValue === 'selected_operations')
      && Array.isArray(operationRefs)
      && operationRefs.every((ref) => typeof ref === 'string')
      ? normalizeAgentAccessOperationSelection({ operationAccess: operationAccessValue, operationRefs })
      : undefined
  } catch {
    operationSelection = undefined
  }
  const expiresInSecondsValue = Number(consent?.dataset.expiresInSeconds)
  const expiresInSeconds = Number.isSafeInteger(expiresInSecondsValue) && expiresInSecondsValue > 0
    ? expiresInSecondsValue
    : undefined
  const accessSummary = consent?.dataset.accessSummary
  let agentTargets: readonly AgentConsentTarget[] = []
  let agentTargetsNextCursor: string | undefined
  let agentTargetsUnavailable = consent?.dataset.agentTargetsUnavailable === 'true'
  const reconnectPrincipalRefValue = consent?.dataset.reconnectPrincipalRef
  const reconnectAmbiguous = consent?.dataset.reconnectAmbiguous === 'true'
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(consent?.dataset.agentTargets ?? '%5B%5D'))
    if (Array.isArray(parsed)) {
      agentTargets = parsed.flatMap((value) => (
        typeof value === 'object' && value !== null
          && 'principalRef' in value && typeof value.principalRef === 'string'
          && 'principalRevision' in value && Number.isSafeInteger(value.principalRevision) && Number(value.principalRevision) > 0
          && 'displayName' in value && typeof value.displayName === 'string'
          ? [{ principalRef: value.principalRef, principalRevision: Number(value.principalRevision), displayName: value.displayName }]
          : []
      ))
    }
    const encodedCursor = consent?.dataset.agentTargetsNextCursor
    if (encodedCursor !== undefined && encodedCursor.length > 0) {
      agentTargetsNextCursor = decodeURIComponent(encodedCursor)
    }
  } catch {
    agentTargets = []
    agentTargetsNextCursor = undefined
    agentTargetsUnavailable = true
  }
  return {
    state,
    ...(grantRef === undefined || grantRef.length === 0 ? {} : { grantRef }),
    ...(grantRevision === undefined ? {} : { grantRevision }),
    ...(flow === 'device_code' || flow === 'authorization_code' ? { flow } : {}),
    ...(clientName === undefined || clientName.length === 0 ? {} : { clientName }),
    ...(mode === undefined || mode.length === 0 ? {} : { mode }),
    ...(accessProfile === 'market' || accessProfile === 'supplier' ? { accessProfile } : {}),
    ...(environment === 'sandbox' || environment === 'production' ? { environment } : {}),
    ...(operationSelection === undefined ? {} : {
      operationAccess: operationSelection.operationAccess,
      operationRefs: operationSelection.operationRefs,
    }),
    ...(expiresInSeconds === undefined ? {} : { expiresInSeconds }),
    ...(accessSummary === undefined || accessSummary.length === 0 ? {} : { accessSummary }),
    agentTargets,
    ...(agentTargetsNextCursor === undefined ? {} : { agentTargetsNextCursor }),
    agentTargetsUnavailable,
    ...(reconnectPrincipalRefValue === undefined || reconnectPrincipalRefValue.length === 0
      ? {}
      : { reconnectPrincipalRef: reconnectPrincipalRefValue }),
    ...(reconnectAmbiguous ? { reconnectAmbiguous: true } : {}),
  }
}
