import { AGENT_ACCESS_AUTHORITY_MODE_VALUES, type AgentAccessAuthorityMode } from './contract'
import { normalizeAgentAccessToolSelection, type AgentAccessToolAccess } from './policy'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

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
  mode?: AgentAccessAuthorityMode
  accessProfile?: 'market' | 'provider'
  environment?: 'sandbox' | 'production'
  toolAccess?: AgentAccessToolAccess
  toolRefs?: readonly string[]
  expiresInSeconds?: number
  accessSummary?: string
  agentTargets: readonly AgentConsentTarget[]
  agentTargetsNextCursor?: string
  agentTargetsUnavailable: boolean
  reconnectPrincipalRef?: string
  reconnectAmbiguous?: boolean
}>

function readConsentTarget(value: unknown): AgentConsentTarget | undefined {
  if (typeof value !== 'object' || value === null
    || !('principalRef' in value) || typeof value.principalRef !== 'string'
    || value.principalRef.trim().length === 0
    || !('principalRevision' in value) || typeof value.principalRevision !== 'number'
    || !Number.isSafeInteger(value.principalRevision) || value.principalRevision <= 0
    || !('displayName' in value) || typeof value.displayName !== 'string'
    || value.displayName.trim().length === 0) return undefined
  return {
    principalRef: value.principalRef,
    principalRevision: value.principalRevision,
    displayName: value.displayName,
  }
}

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
  const modeValue = consent?.dataset.authorityMode
  const mode = AGENT_ACCESS_AUTHORITY_MODE_VALUES.find((candidate) => candidate === modeValue)
  const accessProfile = consent?.dataset.accessProfile
  const environment = consent?.dataset.environment
  const toolAccessValue = consent?.dataset.toolAccess
  let toolSelection: ReturnType<typeof normalizeAgentAccessToolSelection>
  try {
    const toolRefs: unknown = JSON.parse(decodeURIComponent(consent?.dataset.toolRefs ?? ''))
    toolSelection = (toolAccessValue === 'all_admitted' || toolAccessValue === 'selected_tools')
      && Array.isArray(toolRefs)
      && toolRefs.every((ref) => typeof ref === 'string')
      ? normalizeAgentAccessToolSelection({ toolAccess: toolAccessValue, toolRefs })
      : undefined
  } catch (cause) {
    captureRouteException(cause, { site: 'readAgentConsentDetails' }, 'warning')
    toolSelection = undefined
  }
  const expiresInSecondsValue = Number(consent?.dataset.expiresInSeconds)
  const expiresInSeconds = Number.isSafeInteger(expiresInSecondsValue) && expiresInSecondsValue > 0
    ? expiresInSecondsValue
    : undefined
  const accessSummary = consent?.dataset.accessSummary
  let agentTargets: readonly AgentConsentTarget[] = []
  let agentTargetsNextCursor: string | undefined
  const targetAvailability = consent?.dataset.agentTargetsUnavailable
  let agentTargetsUnavailable = targetAvailability !== undefined
    && targetAvailability !== 'false'
  if (targetAvailability === undefined) agentTargetsUnavailable = false
  const reconnectPrincipalRefValue = consent?.dataset.reconnectPrincipalRef
  const reconnectAmbiguous = consent?.dataset.reconnectAmbiguous === 'true'
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(consent?.dataset.agentTargets ?? '%5B%5D'))
    if (Array.isArray(parsed)) {
      agentTargets = parsed.flatMap((value) => {
        const target = readConsentTarget(value)
        if (target === undefined) agentTargetsUnavailable = true
        return target === undefined ? [] : [target]
      })
    } else {
      agentTargetsUnavailable = true
    }
    const encodedCursor = consent?.dataset.agentTargetsNextCursor
    if (encodedCursor !== undefined && encodedCursor.length > 0) {
      const decodedCursor = decodeURIComponent(encodedCursor)
      if (decodedCursor.length === 0 || decodedCursor.length > 2_048) {
        agentTargetsUnavailable = true
      } else {
        agentTargetsNextCursor = decodedCursor
      }
    }
  } catch (cause) {
    captureRouteException(cause, { site: 'readAgentConsentDetails' }, 'warning')
    agentTargetsNextCursor = undefined
    agentTargetsUnavailable = true
  }
  return {
    state,
    ...(grantRef === undefined || grantRef.length === 0 ? {} : { grantRef }),
    ...(grantRevision === undefined ? {} : { grantRevision }),
    ...(flow === 'device_code' || flow === 'authorization_code' ? { flow } : {}),
    ...(clientName === undefined || clientName.length === 0 ? {} : { clientName }),
    ...(mode === undefined ? {} : { mode }),
    ...(accessProfile === 'market' || accessProfile === 'provider' ? { accessProfile } : {}),
    ...(environment === 'sandbox' || environment === 'production' ? { environment } : {}),
    ...(toolSelection === undefined ? {} : {
      toolAccess: toolSelection.toolAccess,
      toolRefs: toolSelection.toolRefs,
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
