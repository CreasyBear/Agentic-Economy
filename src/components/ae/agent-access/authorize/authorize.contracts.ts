import type {
  AgentAccessAuthorizeFormDetails,
  ConsentLocator,
  OAuthPermanentProblemCode,
} from '@/modules/agent-access/consent.contracts'

export type AgentAccessAuthorizeLoaderDeps = Readonly<{
  userCode?: string | undefined
  grantRef?: string | undefined
  state?: string | undefined
}>

export type AgentAccessAuthorizeLoaded =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'problem'; code: OAuthPermanentProblemCode }>
  | Readonly<{ kind: 'outcome_unknown'; grantRef: string; oauthState?: string }>
  | Readonly<{ kind: 'succeeded'; grantRef: string; oauthState?: string }>
  | Readonly<{
      kind: 'ready'
      locator: ConsentLocator
      oauthState?: string
      details: AgentAccessAuthorizeFormDetails
    }>
