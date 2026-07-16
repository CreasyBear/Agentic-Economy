type TerminalState = 'completed' | 'cancelled' | 'outcome_unknown'
type EvidenceState = 'completed' | 'cancelled' | 'outcome_unknown'

type SurfaceObservation = Readonly<{
  requestRef: string
  revision: number
  state: TerminalState
  evidenceState: EvidenceState
  resultDigest?: string
  businesses: readonly string[]
}>

type HumanObservation = SurfaceObservation & Readonly<{ resumedAfterReload: boolean }>

type ParityFailure =
  | 'request_mismatch'
  | 'revision_mismatch'
  | 'state_mismatch'
  | 'evidence_state_mismatch'
  | 'result_mismatch'
  | 'businesses_mismatch'
  | 'human_reload_resume_not_proven'

export function compareCustomerRequestSurfaces(
  input: Readonly<{ human: HumanObservation; agent: SurfaceObservation }>,
) {
  const failures: ParityFailure[] = []
  if (input.human.requestRef !== input.agent.requestRef) failures.push('request_mismatch')
  if (input.human.revision !== input.agent.revision) failures.push('revision_mismatch')
  if (input.human.state !== input.agent.state) failures.push('state_mismatch')
  if (input.human.evidenceState !== input.agent.evidenceState) failures.push('evidence_state_mismatch')
  if (input.human.resultDigest !== input.agent.resultDigest) failures.push('result_mismatch')
  if (JSON.stringify(input.human.businesses) !== JSON.stringify(input.agent.businesses)) {
    failures.push('businesses_mismatch')
  }
  if (!input.human.resumedAfterReload) failures.push('human_reload_resume_not_proven')
  return {
    kind: 'customer_request_cross_surface_parity' as const,
    verdict: failures.length === 0 ? 'pass' as const : 'fail' as const,
    failures,
    requestRef: input.human.requestRef,
    revision: input.human.revision,
    state: input.human.state,
    evidenceState: input.human.evidenceState,
    ...(input.human.resultDigest === undefined ? {} : { resultDigest: input.human.resultDigest }),
    businesses: [...input.human.businesses],
    humanResumedAfterReload: input.human.resumedAfterReload,
  }
}
