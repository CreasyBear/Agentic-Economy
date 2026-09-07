import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import type { AgentConnectionReadback } from '@/modules/agent-access/agent-connection'
import type { ExactAmount } from '@/modules/money/public'
import type { AccountFundingBalance } from '@/modules/money/server'

export type AgentActivityView = Readonly<{
  callRef: string
  credentialRef: string
  toolRef: string
  toolLabel: string
  providerRef: string
  state: 'completed' | 'refused' | 'outcome_unknown'
  deliveryState: 'delivered' | 'not_delivered' | 'unknown'
  paymentState: 'settled' | 'released' | 'unknown' | 'not_applicable'
  audAmountUnits?: string
  receiptRef?: string
  recoveryRef?: string
  createdAt: number
  updatedAt: number
  tool?: Readonly<{
    label: string
    provider: string
  }>
}>

export type AgentUsageSummary = Readonly<{
  periodStartAt: number
  periodEndAt: number
  callCount: number
  completedCallCount: number
  outcomeUnknownCallCount: number
  settledSpend?: ExactAmount
  amountCoverage: 'complete' | 'incomplete'
  updatedAt: number
}>

export type AgentOwnerReadback = Readonly<{
  principalRef: string
  activity: readonly AgentActivityView[]
  activityIsDone: boolean
  activityContinueCursor?: string
  usage?: AgentUsageSummary
  dataState: 'source' | 'empty' | 'partial' | 'unavailable'
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
  activity: readonly AgentActivityView[]
  usage?: AgentUsageSummary
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
  connectionCount: number
  connectorDisplayNames: readonly string[]
  authorityMode: AgentAccessKeyInventoryItem['authorityMode']
}>

/**
 * Durable agent detail assembled from every credential currently known for a
 * canonical Principal. Credential locators are identifiers, never secrets.
 * Activity and usage are fields of the current Agent projection; the shared
 * Account balance lives only on AgentDirectoryProjection.
 */
export type AgentDetail = Readonly<{
  agent: AgentDirectoryItem
  connections: readonly AgentConnectionReadback[]
  credentials: readonly AgentCredentialSummary[]
  currentCredentialRef?: string
  authorityMode: AgentAccessKeyInventoryItem['authorityMode']
  scopes: readonly string[]
  grant?: AgentAccessOwnerGrantReadback
  activity: readonly AgentActivityView[]
  usage?: AgentUsageSummary
  dataState: 'source' | 'empty' | 'partial' | 'unavailable'
  credentialHistoryTruncated?: boolean
  activityTruncated?: boolean
}>

export type AgentDirectoryProjection = Readonly<{
  items: readonly AgentDirectoryItem[]
  details: readonly AgentDetail[]
  nextCursor?: string
  /** One Account fact, read once for the owner surface; never per credential. */
  accountBalance?: AccountFundingBalance
  activityCoverage?: 'complete' | 'recent'
}>
