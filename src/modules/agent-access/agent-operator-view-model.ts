import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import type { AgentSpendingPolicyState } from '@/modules/agent-access/spending-policy-update'
import type { AgentConnectionReadback } from '@/modules/agent-access/agent-connection'
import type { ExactAmount } from '@/modules/money/public'

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

export type AgentOwnerPolicyReadback = Readonly<{
  principalRef: string
  spendingPolicy: AgentSpendingPolicyState
  grant?: AgentAccessOwnerGrantReadback
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
  spendingPolicy: AgentSpendingPolicyState
  currentCredentialGeneration?: number
  lastAuthenticatedAt?: number
  lastSeenAt?: number
  connectionCount: number
  connectorDisplayNames: readonly string[]
  connectionsAvailable?: boolean
  authorityMode: AgentAccessKeyInventoryItem['authorityMode']
  monthlySettledSpend?: ExactAmount | undefined
  monthlyLimit?: ExactAmount | undefined
  monthlySpendCoverage?: 'complete' | 'incomplete' | undefined
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
  connectionsAvailable?: boolean
  credentials: readonly AgentCredentialSummary[]
  currentCredentialRef?: string
  authorityMode: AgentAccessKeyInventoryItem['authorityMode']
  scopes: readonly string[]
  grant?: AgentAccessOwnerGrantReadback
  spendingPolicy: AgentSpendingPolicyState
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
  activityCoverage?: 'complete' | 'recent'
}>
