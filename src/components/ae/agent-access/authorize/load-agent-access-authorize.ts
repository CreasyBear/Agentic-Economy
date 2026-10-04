import { readAgentAccessConsentServer } from '@/lib/server/agent-access-consent.functions'
import { readAgentConsentDetails } from '@/modules/agent-access/consent-read-model'
import type { OAuthPermanentProblemCode } from '@/modules/agent-access/consent.contracts'

import type {
  AgentAccessAuthorizeLoaded,
  AgentAccessAuthorizeLoaderDeps,
} from './authorize.contracts'

function readOAuthPermanentProblemCode(body: string): OAuthPermanentProblemCode | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch (cause) {
    void cause;
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) return undefined
  return parsed.error === 'expired_token' || parsed.error === 'invalid_grant' ? parsed.error : undefined
}

export async function loadAgentAccessAuthorize(
  { deps }: Readonly<{ deps: AgentAccessAuthorizeLoaderDeps }>,
): Promise<AgentAccessAuthorizeLoaded> {
  const locator = deps.userCode !== undefined && deps.grantRef === undefined
    ? { kind: 'user_code' as const, value: deps.userCode }
    : deps.grantRef !== undefined && deps.userCode === undefined
      ? { kind: 'grant_ref' as const, value: deps.grantRef }
      : undefined
  if (locator === undefined) return { kind: 'missing' as const }
  const response = await readAgentAccessConsentServer({ data: {
    ...(deps.userCode === undefined ? {} : { userCode: deps.userCode }),
    ...(deps.grantRef === undefined ? {} : { grantRef: deps.grantRef }),
  } })
  if (response.status < 200 || response.status >= 300) {
    const problemCode = response.status >= 400 && response.status < 500
      ? readOAuthPermanentProblemCode(response.html)
      : undefined
    if (problemCode !== undefined) return { kind: 'problem' as const, code: problemCode }
    throw new Error('authorization_unavailable')
  }
  const details = readAgentConsentDetails(response.html)
  if (details.state === 'outcome_unknown' && details.grantRef !== undefined) {
    return { kind: 'outcome_unknown' as const, grantRef: details.grantRef, ...(deps.state === undefined ? {} : { oauthState: deps.state }) }
  }
  if (details.state === 'succeeded' && details.grantRef !== undefined) {
    return { kind: 'succeeded' as const, grantRef: details.grantRef, ...(deps.state === undefined ? {} : { oauthState: deps.state }) }
  }
  if (details.grantRef === undefined
    || details.grantRevision === undefined
    || details.flow === undefined
    || details.clientName === undefined
    || details.mode === undefined
    || details.environment === undefined
    || details.toolAccess === undefined
    || details.toolRefs === undefined
    || details.expiresInSeconds === undefined
    || details.accessSummary === undefined) {
    throw new Error('authorization_details_missing')
  }
  return {
    kind: 'ready' as const,
    locator,
    ...(deps.state === undefined ? {} : { oauthState: deps.state }),
    details: {
      ...details,
      grantRef: details.grantRef,
      grantRevision: details.grantRevision,
      flow: details.flow,
      clientName: details.clientName,
      mode: details.mode,
      environment: details.environment,
      toolAccess: details.toolAccess,
      toolRefs: details.toolRefs,
      expiresInSeconds: details.expiresInSeconds,
      accessSummary: details.accessSummary,
    },
  }
}
