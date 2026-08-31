export type AgentConsentTarget = Readonly<{
  principalRef: string
  displayName: string
}>

export type AgentConsentDetails = Readonly<{
  grantRef?: string
  clientName?: string
  mode?: string
  accessProfile?: 'market' | 'supplier'
  agentTargets: readonly AgentConsentTarget[]
  agentTargetsNextCursor?: string
  agentTargetsUnavailable: boolean
}>

export function readAgentConsentDetails(html: string): AgentConsentDetails {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const consent = document.querySelector<HTMLElement>('[data-ae-consent]')
  const grantRef = consent?.dataset.grantRef
  const clientName = consent?.dataset.clientName
  const mode = consent?.dataset.authorityMode
  const accessProfile = consent?.dataset.accessProfile
  let agentTargets: readonly AgentConsentTarget[] = []
  let agentTargetsNextCursor: string | undefined
  let agentTargetsUnavailable = consent?.dataset.agentTargetsUnavailable === 'true'
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(consent?.dataset.agentTargets ?? '%5B%5D'))
    if (Array.isArray(parsed)) {
      agentTargets = parsed.flatMap((value) => (
        typeof value === 'object' && value !== null
          && 'principalRef' in value && typeof value.principalRef === 'string'
          && 'displayName' in value && typeof value.displayName === 'string'
          ? [{ principalRef: value.principalRef, displayName: value.displayName }]
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
    ...(grantRef === undefined || grantRef.length === 0 ? {} : { grantRef }),
    ...(clientName === undefined || clientName.length === 0 ? {} : { clientName }),
    ...(mode === undefined || mode.length === 0 ? {} : { mode }),
    ...(accessProfile === 'market' || accessProfile === 'supplier' ? { accessProfile } : {}),
    agentTargets,
    ...(agentTargetsNextCursor === undefined ? {} : { agentTargetsNextCursor }),
    agentTargetsUnavailable,
  }
}
