import type { InvocationActor } from './contracts'

export type HostedSandboxProviderKey = 'A' | 'B'

export type HostedSandboxProvider = Readonly<{
  providerId: string
  sourceRef: string
  recipient: string
  endpoint: string
  operationKey: string
  operationRevision: string
}>

export type HostedPaidOperationCreationRecord = Readonly<{
  actor: InvocationActor
  providerKey: HostedSandboxProviderKey
  provider: HostedSandboxProvider & Readonly<{
    amount: Readonly<{ currency: 'USD'; amountMinor: 1 }>
  }>
  materialInput: Readonly<{ symbol: 'BTC'; convert: 'USD' }>
  invocationRef: string
  authorityRef: string
  paymentIdentifier: string
  effectIdentity: string
  terminalTruth: 'active' | 'safely_terminal' | 'uncertain'
}>

type CreationResult =
  | Readonly<{ kind: 'created'; record: HostedPaidOperationCreationRecord }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'setup_shape_invalid'
        | 'provider_fixture_unavailable'
        | 'provider_switch_not_safe'
        | 'trial_disabled'
        | 'principal_not_allowlisted'
        | 'total_exhausted'
        | 'concurrency_exhausted'
        | 'rate_exhausted'
    }>

type Setup = Readonly<{ providerKey: HostedSandboxProviderKey }>

/**
 * Evaluator-only source boundary. The caller selects one closed fixture name;
 * every consequence-bearing fact and identity is resolved or generated here.
 */
export function createHostedPaidOperation(input: Readonly<{
  reserveAdmission(args: Readonly<{
    principalRef: string
    windowKey: string
  }>): Promise<
    | Readonly<{ kind: 'admitted'; reservationRef: string }>
    | Readonly<{
        kind: 'refused'
        code: 'trial_disabled' | 'principal_not_allowlisted' | 'total_exhausted' |
          'concurrency_exhausted' | 'rate_exhausted'
      }>
  >
  resolveProvider(key: HostedSandboxProviderKey): HostedSandboxProvider | undefined
  persistProviderBinding(input: Readonly<{
    actor: InvocationActor
    reservationRef: string
    providerKey: HostedSandboxProviderKey
    provider: HostedSandboxProvider
    materialInput: Readonly<{ symbol: 'BTC'; convert: 'USD' }>
  }>): Promise<void>
  nextIdentity(kind: 'invocation' | 'authority' | 'payment' | 'effect'): string
  persistCreated(record: HostedPaidOperationCreationRecord): Promise<void>
  windowKey?: () => string
}>): Readonly<{
  create(args: Readonly<{ actor: InvocationActor; setup: Setup }>): Promise<CreationResult>
  switchProvider(args: Readonly<{
    actor: InvocationActor
    previous: HostedPaidOperationCreationRecord
    setup: Setup
  }>): Promise<CreationResult>
}> {
  const create = async (
    args: Readonly<{ actor: InvocationActor; setup: Setup }>,
  ): Promise<CreationResult> => {
    if (!exactSetup(args.setup)) return { kind: 'refused', code: 'setup_shape_invalid' }
    const admission = await input.reserveAdmission({
      principalRef: args.actor.principalRef,
      windowKey: input.windowKey?.() ?? 'hosted-sandbox',
    })
    if (admission.kind === 'refused') return admission
    const provider = input.resolveProvider(args.setup.providerKey)
    if (provider === undefined) {
      return { kind: 'refused', code: 'provider_fixture_unavailable' }
    }
    const materialInput = { symbol: 'BTC', convert: 'USD' } as const
    await input.persistProviderBinding({
      actor: args.actor,
      reservationRef: admission.reservationRef,
      providerKey: args.setup.providerKey,
      provider,
      materialInput,
    })
    const record: HostedPaidOperationCreationRecord = {
      actor: args.actor,
      providerKey: args.setup.providerKey,
      provider: {
        ...provider,
        amount: { currency: 'USD', amountMinor: 1 },
      },
      materialInput,
      invocationRef: input.nextIdentity('invocation'),
      authorityRef: input.nextIdentity('authority'),
      paymentIdentifier: input.nextIdentity('payment'),
      effectIdentity: input.nextIdentity('effect'),
      terminalTruth: 'active',
    }
    await input.persistCreated(record)
    return { kind: 'created', record }
  }

  return Object.freeze({
    create,
    switchProvider: async ({ actor, previous, setup }) => {
      if (previous.terminalTruth !== 'safely_terminal') {
        return { kind: 'refused', code: 'provider_switch_not_safe' }
      }
      return create({ actor, setup })
    },
  })
}

function exactSetup(value: Setup): boolean {
  if (value === null || typeof value !== 'object') return false
  const keys = Object.keys(value)
  return keys.length === 1
    && keys[0] === 'providerKey'
    && (value.providerKey === 'A' || value.providerKey === 'B')
}
