import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const application = readFileSync(
  'src/modules/action-invocation/paid-operation-application-service.ts',
  'utf8',
)
const semantics = readFileSync(
  'src/modules/action-invocation/paid-operation-semantics.ts',
  'utf8',
)
const schema = readFileSync(
  'src/modules/action-invocation/internal/convex-schema.ts',
  'utf8',
)
const convex = readFileSync('convex/actionInvocationControl.ts', 'utf8')

function absentContract(reason: string, source: string, token: string) {
  expect(source, `[P3C_RED:${reason}] required Phase 3C contract is absent`).toContain(token)
}

describe('Phase 3C hosted paid-operation contract RED', () => {
  it('reconstructs the hosted aggregate from bounded source and control records', () => {
    absentContract('hosted_aggregate_reconstruction_absent', application, 'HostedPaidOperationAggregate')
  })

  it('returns aggregate_incomplete instead of projecting a cap plus one read', () => {
    absentContract('bounded_aggregate_cap_absent', convex, 'aggregate_incomplete')
  })

  it('reloads the committed aggregate after every mutating command', () => {
    absentContract('post_command_durable_refresh_absent', application, 'reloadCommittedHostedAggregate')
  })

  it('keeps business and provider truth out of neutral control', () => {
    absentContract('business_control_ownership_gate_absent', schema, 'hostedBusinessTruthForbidden')
  })

  it('persists only opaque custody references and rejects raw secret or evidence material', () => {
    absentContract('opaque_custody_serialization_gate_absent', schema, 'opaqueHostedCustodyReferenceValue')
  })

  it('persists submission-started before a possible provider release', () => {
    absentContract('submission_started_ordering_contract_absent', application, 'persistSubmissionStartedBeforeRelease')
  })

  it('exposes an intent-only public reconcile command', () => {
    absentContract('public_reconcile_intent_dto_absent', application, 'PaidOperationPublicReconcileIntent')
  })

  it('separates public reconcile intent from internal trusted resolution types', () => {
    absentContract('public_internal_reconcile_split_absent', application, 'PaidOperationTrustedResolutionCommand')
  })

  it('admits reconciliation only through a trusted evidence observer', () => {
    absentContract('trusted_reconciliation_observer_absent', application, 'TrustedPaidOperationEvidencePort')
  })

  it('creates pairwise-distinct consequence lineage when switching provider', () => {
    absentContract('provider_switch_new_lineage_contract_absent', application, 'createDistinctProviderSwitchInvocation')
  })

  it('allows reconcile only while payment truth is uncertain', () => {
    absentContract('uncertainty_continuation_gate_absent', semantics, 'assertHostedUncertaintyReconcileOnly')
  })

  it('keeps authority recording and execution as distinct golden transitions', () => {
    absentContract('golden_authority_execute_boundary_absent', application, 'permissionRecordedNothingSubmitted')
  })

  it('supplies evidence labels at runtime without letting local fixtures claim hosted proof', () => {
    absentContract('runtime_evidence_label_admission_absent', semantics, 'authenticated_exact_revision_hosted_sandbox')
  })
})
