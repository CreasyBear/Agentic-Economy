import type { InvocationActor } from './contracts'
import type { HostedPaidOperationAggregate } from './hosted-paid-operation-port'
import {
  createHostedPaidOperationPaymentProposal,
  type HostedPaidOperationPaymentProposal,
} from './hosted-paid-operation-payment-proposal'
import type { ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'

export type HostedSandboxProviderKey = 'A' | 'B'

export type HostedSandboxProvider = Readonly<{
  providerId: string
  providerName: string
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
  paymentProposal: HostedPaidOperationPaymentProposal
  effectIdentity: string
  terminalTruth: 'active' | 'safely_terminal' | 'uncertain'
  environment?: Readonly<{ name: string; evidenceClass: string; claimCeiling: string }>
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
        | 'creation_conflict'
        | 'aggregate_incomplete'
    }>

type Setup = Readonly<{ providerKey: HostedSandboxProviderKey }>

/**
 * Evaluator-only source boundary. The caller selects one closed fixture name;
 * every consequence-bearing fact and identity is resolved or generated here.
 */
export function createHostedPaidOperation<Result extends ActionResult>(input: Readonly<{
  reserveAdmission(args: Readonly<{
    principalRef: string
    windowKey: string
  }>): Promise<
    | Readonly<{
        kind: 'admitted'
        reservationRef: string
        environment?: Readonly<{ name: string; evidenceClass: string; claimCeiling: string }>
      }>
    | Readonly<{
        kind: 'refused'
        code: 'trial_disabled' | 'principal_not_allowlisted' | 'total_exhausted' |
          'concurrency_exhausted' | 'rate_exhausted'
      }>
  >
  resolveProvider(key: HostedSandboxProviderKey): HostedSandboxProvider | undefined
  nextIdentity(kind: 'invocation' | 'authority' | 'payment' | 'effect'): string
  createInitial(input: Readonly<{
    record: HostedPaidOperationCreationRecord
    reservationRef: string
    aggregate: HostedPaidOperationAggregate<Result>
  }>): Promise<
    | Readonly<{ kind: 'created' | 'duplicate' }>
    | Readonly<{
        kind: 'refused'
        code: 'creation_command_conflict' | 'invocation_already_exists' | 'aggregate_incomplete'
      }>
  >
  buildInitialAggregate?: (
    record: HostedPaidOperationCreationRecord,
  ) => HostedPaidOperationAggregate<Result>
  windowKey?: () => string
  now?: () => string
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
    const invocationRef = input.nextIdentity('invocation')
    const authorityRef = input.nextIdentity('authority')
    const paymentIdentifier = input.nextIdentity('payment')
    const effectIdentity = input.nextIdentity('effect')
    const preparedAt = input.now?.() ?? '1970-01-01T00:00:00.000Z'
    const custodyRef = canonicalDigest({
      kind: 'hosted-paid-operation-custody-reference',
      paymentIdentifier,
    })
    const paymentProposal = createHostedPaidOperationPaymentProposal({
      paymentIdentifier,
      providerId: provider.providerId,
      operationKey: provider.operationKey,
      operationRevision: provider.operationRevision,
      providerEndpoint: provider.endpoint,
      scheme: 'exact',
      network: 'eip155:84532',
      asset: 'USDC',
      payTo: provider.recipient,
      amount: '0.01',
      challengeDigest: canonicalDigest({
        kind: 'hosted-sandbox-challenge',
        paymentIdentifier,
      }),
      authorizationDigest: canonicalDigest({
        kind: 'hosted-sandbox-authorization',
        paymentIdentifier,
      }),
      custodyRef,
      preparedAt,
    })
    const record: HostedPaidOperationCreationRecord = {
      actor: args.actor,
      providerKey: args.setup.providerKey,
      provider: {
        ...provider,
        amount: { currency: 'USD', amountMinor: 1 },
      },
      materialInput,
      invocationRef,
      authorityRef,
      paymentIdentifier,
      paymentProposal,
      effectIdentity,
      terminalTruth: 'active',
      ...(admission.environment === undefined ? {} : { environment: admission.environment }),
    }
    const aggregate = input.buildInitialAggregate?.(record)
      ?? defaultInitialAggregate(record) as HostedPaidOperationAggregate<Result>
    const created = await input.createInitial({
      record,
      reservationRef: admission.reservationRef,
      aggregate,
    })
    if (created.kind === 'refused') {
      return {
        kind: 'refused',
        code: created.code === 'aggregate_incomplete'
          ? 'aggregate_incomplete'
          : 'creation_conflict',
      }
    }
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

function defaultInitialAggregate(
  record: HostedPaidOperationCreationRecord,
): HostedPaidOperationAggregate<ActionResult> {
  return {
    header: {
      ownerPrincipalRef: record.actor.principalRef,
      invocationRef: record.invocationRef,
      selectedSourceRef: record.provider.sourceRef,
      paymentAttemptRequired: true,
      currentPaymentIdentifier: record.paymentIdentifier,
      historyCursor: null,
      historyPageSize: 20,
    },
    invocation: {
      invocationRef: record.invocationRef,
      invocationVersion: 1,
      environment: 'MOCK/DEVELOPMENT ONLY',
      persistence: 'durable_control',
      origin: {
        kind: 'standalone',
        callerRef: record.actor.callerRef,
        principalRef: record.actor.principalRef,
      },
      owner: record.actor,
      action: { id: 'hosted-paid-operation', contractVersion: '1' },
      desired: { state: 'invoke' },
      prepared: {
        materialInputDigest: canonicalDigest(record.materialInput),
        target: {
          providerId: record.provider.providerId,
          sourceRef: record.provider.sourceRef,
          operationRevision: record.provider.operationRevision,
        },
        consequence: 'release one labelled sandbox paid query',
        dataUse: { fields: ['symbol', 'convert'], limits: { amountMinor: 1 } },
        preparedAt: record.paymentProposal.preparedAt,
        freshUntil: '9999-12-31T23:59:59.999Z',
      },
      authority: {
        reference: record.authorityRef,
        expiresAt: '9999-12-31T23:59:59.999Z',
      },
      attempts: [],
      observedResolution: { state: 'pending' },
      freshness: { state: 'current', observedAt: '1970-01-01T00:00:00.000Z' },
      control: { state: 'awaiting_authority' },
    },
    paymentAttempt: {
      paymentIdentifier: record.paymentIdentifier,
      custodyRef: record.paymentProposal.custodyRef,
      state: 'prepared',
      evidenceRefs: [],
    },
    paymentProposal: record.paymentProposal,
    interpretation: {
      operation: {
        operationKey: record.provider.operationKey,
        providerId: record.provider.providerId,
        providerName: record.provider.providerName,
        operationRevision: record.provider.operationRevision,
        materialInputs: record.materialInput,
      },
      presentation: {
        title: 'Get the latest BTC price in USD',
        summary: 'Retrieve one labelled sandbox BTC/USD measurement.',
        blocks: [{ kind: 'text', label: 'Pair', value: 'BTC/USD' }],
      },
      maximumAuthorizedCharge: record.provider.amount,
      queryRecipient: record.provider.recipient,
      resultDelivery: { state: 'not_delivered' },
      environment: record.environment ?? {
        name: 'local-labelled-sandbox-fixture',
        evidenceClass: 'local_labelled_sandbox_fixture',
        claimCeiling: 'durable_fixture_mechanics_only',
      },
    },
    evidenceReferences: [],
    history: [],
  }
}

function exactSetup(value: Setup): boolean {
  if (value === null || typeof value !== 'object') return false
  const keys = Object.keys(value)
  return keys.length === 1
    && keys[0] === 'providerKey'
    && (value.providerKey === 'A' || value.providerKey === 'B')
}
