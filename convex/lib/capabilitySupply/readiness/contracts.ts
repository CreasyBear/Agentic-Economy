import { v, type Infer } from 'convex/values'
import type { CapabilityProbeTargetUnavailableReason, ReadCapabilityProbeTargetResult } from '@/modules/capability-supply/public'
import type { Id } from '../../../_generated/dataModel'
import { publicationLifecycleValue } from '../../../capabilitySupplyShared'
import { workloadCronSnapshotValue } from '../../platform/workloadCron/context'

export const probeArgs = { publicationRef: v.string(), expectedRevision: v.number() }
export const probeOwnerStagedArgs = { ...probeArgs, businessId: v.id('businesses') }
export const probeFromCronArgs = { ...probeArgs, workload: workloadCronSnapshotValue }

type PublicationLifecycle = Infer<typeof publicationLifecycleValue>
type ProbeRecordResult =
  | { kind: 'observed'; publicationRef: string; revision: number; lifecycle: PublicationLifecycle }
  | { kind: 'refused'; reason: 'revision_changed' | 'target_changed' }
type ProbeArgs = { publicationRef: string; expectedRevision: number }
type OwnerStagedProbeArgs = ProbeArgs & { businessId: Id<'businesses'> }
type CapabilityProbeAuthority = Readonly<{
  publicationRef: string
  publicationRevision: number
  businessId: Id<'businesses'>
  publisherPrincipalRef: string
  ownerPrincipalRef: string
  owningAccountRef: string
  ownershipRef: string
  accountRevision: number
  authorityDigest: string
}> & (
  | Readonly<{ mode: 'human_owner'; publisherPrincipalRevision: number }>
  | Readonly<{
      mode: 'agent_grant'
      grantRef: string
      grantGeneration: number
      grantPolicyDigest: string
      authorityExpiresAt: number
    }>
  | Readonly<{
      mode: 'system_workload'
      workloadPrincipalRevision: number
      membershipRef: string
      membershipRevision: number
    }>
)
type ProbeTargetBase = Extract<ReadCapabilityProbeTargetResult, { kind: 'available' }>['target']
type WithResourceAuthority<T> = T extends unknown
  ? T & Readonly<{ resourceAuthority: CapabilityProbeAuthority }>
  : never
type Target = WithResourceAuthority<ProbeTargetBase>
type ProbeTargetResult =
  | Exclude<ReadCapabilityProbeTargetResult, { kind: 'available' }>
  | Readonly<{ kind: 'available'; target: Target }>
type ProbeResult = ProbeRecordResult | {
  kind: 'unavailable'
  reason: CapabilityProbeTargetUnavailableReason
  evidenceRefs: string[]
}

type ProbeTerminalEvent =
  | Readonly<{ terminalKind: 'observed'; lifecycleState: PublicationLifecycle['state'] }>
  | Readonly<{
      terminalKind: 'unavailable'
      reason: CapabilityProbeTargetUnavailableReason
    }>
  | Readonly<{
      terminalKind: 'refused'
      reason: Extract<ProbeRecordResult, { kind: 'refused' }>['reason']
    }>
const probeTargetUnavailableReasonValue = v.union(
  v.literal('publication_missing'), v.literal('publication_stale'),
  v.literal('offering_invalid'), v.literal('binding_invalid'),
  v.literal('contract_missing'), v.literal('input_unrepresentable'),
  v.literal('effectful_probe_unsupported'),
  v.literal('mcp_tool_missing'), v.literal('authority_stale'),
  v.literal('target_not_public'),
)
export const probeResultValue = v.union(
  v.object({
    kind: v.literal('unavailable'),
    reason: probeTargetUnavailableReasonValue,
    evidenceRefs: v.array(v.string()),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(v.literal('revision_changed'), v.literal('target_changed')),
  }),
  v.object({
    kind: v.literal('observed'),
    publicationRef: v.string(),
    revision: v.number(),
    lifecycle: publicationLifecycleValue,
  }),
)
export type { ProbeArgs, OwnerStagedProbeArgs, ProbeResult, ProbeRecordResult, ProbeTargetResult, Target, ProbeTerminalEvent }
