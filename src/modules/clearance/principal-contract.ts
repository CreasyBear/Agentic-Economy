import { z } from 'zod'

import { stableHash } from '@/modules/common/stable-hash'

export const AgentPrincipalSourceVersion = 'agent-principal:v1' as const

export const AgentPrincipalStatusValues = ['active', 'suspended', 'revoked'] as const
export type AgentPrincipalStatus = (typeof AgentPrincipalStatusValues)[number]

export const AgentPrincipalReputationTierValues = ['unrated', 'trusted', 'restricted'] as const
export type AgentPrincipalReputationTier = (typeof AgentPrincipalReputationTierValues)[number]

export type AgentPrincipalIdInput = Readonly<{
  signatureAgent: string
  keyid: string
}>

export type AgentPrincipalRecord = Readonly<{
  principalId: string
  signatureAgent: string
  keyid: string
  operatorRef?: string
  status: AgentPrincipalStatus
  reputationTier: AgentPrincipalReputationTier
  sourceVersion: typeof AgentPrincipalSourceVersion
  firstSeenAt: number
  lastSeenAt: number
  lastVerifiedAt: number
  requestCount: number
}>

export const agentPrincipalRecordSchema = z.strictObject({
    principalId: z.string().min(1),
    signatureAgent: z.url(),
    keyid: z.string().min(1),
    operatorRef: z.string().min(1).optional(),
    status: z.enum(AgentPrincipalStatusValues),
    reputationTier: z.enum(AgentPrincipalReputationTierValues),
    sourceVersion: z.literal(AgentPrincipalSourceVersion),
    firstSeenAt: z.number().int().nonnegative(),
    lastSeenAt: z.number().int().nonnegative(),
    lastVerifiedAt: z.number().int().nonnegative(),
    requestCount: z.number().int().nonnegative(),
  })

export function buildAgentPrincipalId(input: AgentPrincipalIdInput): string {
  return `agentPrincipal:${stableHash({
    keyid: input.keyid,
    signatureAgent: input.signatureAgent,
  })}`
}
