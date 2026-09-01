import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import type { CreditAccountView, CreditActivityView, KeyUsageView } from '@/modules/money/public'

export type AgentActivityView = CreditActivityView & Readonly<{
  operation?: Readonly<{
    label: string
    supplier: string
  }>
}>

/**
 * Presentation-ready readback for one agent credential.
 *
 * The server projection and React surface share this domain-owned contract so
 * server modules never depend on component files.
 */
/** Internal source material used to assemble one durable agent. */
export type AgentCredentialSource = Readonly<{
  key: AgentAccessKeyInventoryItem
  grant?: AgentAccessOwnerGrantReadback
  principalId: string
  account?: CreditAccountView
  activity: readonly AgentActivityView[]
  usage?: KeyUsageView
  dataState: 'source' | 'empty' | 'unavailable'
}>

export type AgentCredentialSummary = Readonly<{
  credentialRef: string
  generation: number
  lifecycle: 'active' | 'stale' | 'revoked'
  predecessorCredentialRef?: string
  issuedAt: number
  expiresAt: number
  lastAuthenticatedAt?: number
}>

export type AgentDirectoryItem = Readonly<{
  principalRef: string
  principalRevision: number
  displayName: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  status: 'connected' | 'attention' | 'expired' | 'disconnected'
  currentCredentialGeneration?: number
  lastAuthenticatedAt?: number
  lastSeenAt?: number
}>

export type AgentUsageSummary = Readonly<Omit<KeyUsageView, 'credentialId'>>

/**
 * Durable agent detail assembled from every credential currently known for a
 * canonical Principal. Credential locators are identifiers, never secrets.
 * Account, activity, and usage are fields of the current agent projection; no
 * key-shaped compatibility projection is exposed alongside it.
 */
export type AgentDetail = Readonly<{
  agent: AgentDirectoryItem
  credentials: readonly AgentCredentialSummary[]
  currentCredentialRef?: string
  authorityMode: AgentAccessKeyInventoryItem['authorityMode']
  scopes: readonly string[]
  grant?: AgentAccessOwnerGrantReadback
  account?: CreditAccountView
  activity: readonly AgentActivityView[]
  usage?: AgentUsageSummary
  dataState: 'source' | 'empty' | 'partial' | 'unavailable'
  credentialHistoryTruncated?: boolean
}>

export type AgentDirectoryProjection = Readonly<{
  items: readonly AgentDirectoryItem[]
  details: readonly AgentDetail[]
  nextCursor?: string
}>
