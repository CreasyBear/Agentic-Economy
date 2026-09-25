import type { Doc } from '../../../_generated/dataModel'
import type { AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
export type ConsentReservationArgs = Readonly<{
  expectedGrantRevision: number
  expectedTargetRevision: number
  authorityMode: AgentAccessAuthorityMode
  approvedToolAccess: 'all_admitted' | 'selected_tools'
  approvedToolRefs: readonly string[]
  connectionTarget:
    | Readonly<{ kind: 'new_agent' }>
    | Readonly<{
        kind: 'replace_credential'
        principalRef: string
        replacementMode: 'planned' | 'compromise'
      }>
}>

export type ConsentCommand = Readonly<{
  action: 'agent_access.create' | 'agent_access.replace_credential'
  grantRef: string
  expectedGrantRevision: number
  authorityMode: AgentAccessAuthorityMode
  connectionTarget: ConsentReservationArgs['connectionTarget']
  resolvedConnectionTarget:
    | Readonly<{ kind: 'new_agent'; displayName: string }>
    | Readonly<{
        kind: 'replace_credential'
        principalRef: string
        replacementMode: 'planned' | 'compromise'
      }>
  selectedScopes: readonly string[]
  issuanceMaterial: Readonly<{
    clientId: string
    flow: Doc<'agentAccessOAuthGrants'>['flow']
    displayName: string
    requestedAccess: Doc<'agentAccessOAuthGrants'>['requestedAccess']
    approvedAccess: Doc<'agentAccessOAuthGrants'>['approvedAccess']
  }>
  predecessor?: AgentAccessPredecessorSnapshot
  target: Readonly<{ targetType: string; targetRef: string; targetRevision: number }>
  targetRevision: number
  consequenceSummary: string
}>

export type AgentAccessPredecessorSnapshot = Readonly<{
  credentialId: string
  applicationRef: string
  environment: Doc<'agentAccessPrincipals'>['environment']
  grantRef: string
  grantGeneration: number
  spendingPolicyDigest: string
  bindingRef: string
  bindingRevision: number
  bindingCredentialGeneration: number
  credentialRef: string
  credentialRevision: number
  credentialGeneration: number
}>
