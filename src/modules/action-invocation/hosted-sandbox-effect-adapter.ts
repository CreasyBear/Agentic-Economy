export type HostedSandboxEffectState =
  | 'prepared'
  | 'possibly_submitted'
  | 'observed'
  | 'reconciliation_required'

export type HostedSandboxEffectRecord = Readonly<{
  invocationRef: string
  attemptRef: string
  effectGeneration: number
  paymentIdentifier: string
  operationKey: string
  operationRevision: string
  challengeDigest: string
  providerEndpoint: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amount: string
  authorizationDigest: string
  custodyRef: string
  state: HostedSandboxEffectState
  preparedAt: number
  submissionStartedAt?: number
  observedAt?: number
  evidenceRefs: readonly string[]
}>

type Counters = Readonly<{
  prepared: number
  submissionStarted: number
  mockRelease: number
  result: number
  uncertainty: number
  duplicateOrStaleRefusal: number
  unexpectedEffect: number
}>

type ExecutionResult =
  | Readonly<{ kind: 'observed'; record: HostedSandboxEffectRecord }>
  | Readonly<{ kind: 'uncertain'; record: HostedSandboxEffectRecord }>
  | Readonly<{
      kind: 'refused'
      code: 'reconciliation_required' | 'effect_already_observed'
      record: HostedSandboxEffectRecord
    }>

type HostedSandboxEffectAdapter = Readonly<{
  execute(): Promise<ExecutionResult>
  counters(): Counters
}>

/**
 * One labelled-mock release boundary. Durable possible-submission truth is
 * written before the injected mock can observe authorization material.
 */
export function createHostedSandboxEffectAdapter(input: Readonly<{
  prepareCustody(): Promise<Readonly<{
    record: HostedSandboxEffectRecord
    authorizationMaterial: string
  }>>
  readPreparedCustody(record: HostedSandboxEffectRecord): Promise<string>
  persist(record: HostedSandboxEffectRecord): Promise<void>
  load(): Promise<HostedSandboxEffectRecord | undefined>
  releaseLabelledMock(input: Readonly<{
    authorizationMaterial: string
    binding: Pick<
      HostedSandboxEffectRecord,
      'invocationRef' | 'attemptRef' | 'effectGeneration' | 'paymentIdentifier' |
        'providerEndpoint' | 'payTo' | 'amount'
    >
  }>): Promise<Readonly<{ kind: 'observed'; evidenceRefs: readonly string[] }>>
  now(): number
}>): HostedSandboxEffectAdapter {
  const counts = {
    prepared: 0,
    submissionStarted: 0,
    mockRelease: 0,
    result: 0,
    uncertainty: 0,
    duplicateOrStaleRefusal: 0,
    unexpectedEffect: 0,
  }

  const adapter: HostedSandboxEffectAdapter = {
    execute: async (): Promise<ExecutionResult> => {
      const existing = await input.load()
      if (existing !== undefined && existing.state !== 'prepared') {
        counts.duplicateOrStaleRefusal += 1
        return existing.state === 'observed'
          ? { kind: 'refused', code: 'effect_already_observed', record: existing }
          : { kind: 'refused', code: 'reconciliation_required', record: existing }
      }
      const custody = existing === undefined
        ? await input.prepareCustody()
        : {
            record: existing,
            authorizationMaterial: await input.readPreparedCustody(existing),
          }
      assertDurableRecord(custody.record)
      if (existing === undefined) {
        await input.persist(custody.record)
        counts.prepared += 1
      }
      const possibleSubmission: HostedSandboxEffectRecord = {
        ...custody.record,
        state: 'possibly_submitted',
        submissionStartedAt: input.now(),
      }
      await input.persist(possibleSubmission)
      counts.submissionStarted += 1
      counts.mockRelease += 1
      try {
        const observation = await input.releaseLabelledMock({
          authorizationMaterial: custody.authorizationMaterial,
          binding: {
            invocationRef: possibleSubmission.invocationRef,
            attemptRef: possibleSubmission.attemptRef,
            effectGeneration: possibleSubmission.effectGeneration,
            paymentIdentifier: possibleSubmission.paymentIdentifier,
            providerEndpoint: possibleSubmission.providerEndpoint,
            payTo: possibleSubmission.payTo,
            amount: possibleSubmission.amount,
          },
        })
        const observed: HostedSandboxEffectRecord = {
          ...possibleSubmission,
          state: 'observed',
          observedAt: input.now(),
          evidenceRefs: observation.evidenceRefs,
        }
        assertDurableRecord(observed)
        await input.persist(observed)
        counts.result += 1
        return { kind: 'observed', record: observed }
      } catch {
        const uncertain: HostedSandboxEffectRecord = {
          ...possibleSubmission,
          state: 'reconciliation_required',
        }
        await input.persist(uncertain)
        counts.uncertainty += 1
        return { kind: 'uncertain', record: uncertain }
      }
    },
    counters: () => ({ ...counts }),
  }
  return Object.freeze(adapter)
}

function assertDurableRecord(record: HostedSandboxEffectRecord): void {
  const serialized = JSON.stringify(record)
  if (
    !/^sha256:[a-f0-9]{64}$/u.test(record.custodyRef)
    || record.evidenceRefs.some((reference) => !/^sha256:[a-f0-9]{64}$/u.test(reference))
    || /authorizationMaterial|Bearer |raw-secret/u.test(serialized)
  ) {
    throw new Error('hosted_sandbox_raw_material_forbidden')
  }
}
