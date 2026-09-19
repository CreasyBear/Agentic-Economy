/**
 * OAuth protocol problem codes used by the authorize route loader.
 * These are RFC-style `error` values. Do not rename or alias them.
 */

import type { AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
import type { AgentConsentDetails, AgentConsentTarget } from '@/modules/agent-access/consent-read-model'

export type OAuthPermanentProblemCode = 'expired_token' | 'invalid_grant'

export type ConsentActionResult =
  | Readonly<{ kind: 'approved'; grantRef: string; redirectTo?: string; readbackRef?: string }>
  | Readonly<{ kind: 'denied'; grantRef: string; redirectTo?: string }>
  | Readonly<{ kind: 'outcome_unknown'; grantRef: string; readbackRef: string; correlationRef?: string }>
  | Readonly<{ kind: 'refused' | 'conflict'; code: string }>
  | Readonly<{ kind: 'rate_limited'; retryAfter: number }>
  | Readonly<{ kind: 'unavailable'; code: 'security_control_unavailable'; correlationRef: string }>

export type AgentAccessAuthorizeFormDetails = AgentConsentDetails & Readonly<{
  grantRef: string
  grantRevision: number
  flow: 'device_code' | 'authorization_code'
  clientName: string
  mode: AgentAccessAuthorityMode
  environment: 'sandbox' | 'production'
  toolAccess: 'all_admitted' | 'selected_tools'
  toolRefs: readonly string[]
  expiresInSeconds: number
  accessSummary: string
}>

export type ConsentLocator = Readonly<{ kind: 'user_code' | 'grant_ref'; value: string }>

export type ConsentConnectionChoice =
  | Readonly<{ target: 'new_agent' }>
  | Readonly<{
      target: 'replace_credential'
      replacementMode: 'planned' | 'compromise'
      replacementPrincipalRef?: string
    }>

export type ConsentDecisionPhase =
  | Readonly<{ phase: 'idle' }>
  | Readonly<{ phase: 'submitting' }>
  | Readonly<{ phase: 'approved' }>
  | Readonly<{ phase: 'denied' }>
  | Readonly<{ phase: 'outcome_unknown' }>
  | Readonly<{ phase: 'error'; errorCode: string; errorReference?: string }>

export type ConsentFormConnectionState = Readonly<{
  connection: ConsentConnectionChoice
  agentTargets: readonly AgentConsentTarget[]
  agentTargetsUnavailable: boolean
  agentTargetsNextCursor?: string
  agentTargetsLoading: boolean
  agentTargetsError?: string
}>
