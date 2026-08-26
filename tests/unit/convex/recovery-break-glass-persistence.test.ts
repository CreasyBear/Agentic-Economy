import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import schema from '../../../convex/schema'
import {
  accountRef,
  principalRef,
} from '../../../src/modules/principal-account/public'
import {
  delegationGrantRef,
  type AdmitConsequenceRequest,
  type DelegationContextPort,
} from '../../../src/modules/authority/delegation/public'
import type {
  AuthorizeRecoveryRequest,
  ProductionRecoveryServiceOptions,
  RecoveryAccountFactsPort,
  RecoveryAdmission,
  RecoveryAuthorityPort,
  VerifiedBreakGlassApproval,
} from '../../../src/modules/authority/recovery/public'
import { convexModules } from '../../helpers/convex-fixtures'

type AdapterProbeMode =
  | 'record-unavailable'
  | 'context-mismatch'
  | 'root-issuer'
  | 'principal-active'
  | 'principal-inactive'

const adapterProbe = vi.hoisted(() => ({ mode: 'record-unavailable' as AdapterProbeMode }))

vi.mock('../../../src/modules/authority/delegation/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import(
    '../../../src/modules/authority/delegation/public'
  )>()

  class ProbeDelegationService {
    readonly #contexts: DelegationContextPort

    constructor(_store: unknown, contexts: DelegationContextPort) {
      this.#contexts = contexts
    }

    async admitConsequence(request: AdmitConsequenceRequest): Promise<never> {
      if (adapterProbe.mode === 'context-mismatch') {
        await this.#contexts.resolveActiveContext({
          ...request.context,
          activeAccountRef: accountRef('acc_00000000000040008000000000000999'),
        })
      }
      if (adapterProbe.mode === 'root-issuer') {
        await this.#contexts.resolveRootIssuerContext(request.context)
      }
      if (adapterProbe.mode === 'principal-active') {
        await this.#contexts.requireActivePrincipal(
          principalRef('prn_00000000000040008000000000000042'),
        )
        throw new Error('adapter_probe_complete')
      }
      if (adapterProbe.mode === 'principal-inactive') {
        await this.#contexts.requireActivePrincipal(
          principalRef('prn_00000000000040008000000000000043'),
        )
      }
      throw new Error('adapter_probe_mode_invalid')
    }
  }

  return { ...actual, DelegationService: ProbeDelegationService }
})

vi.mock('../../../src/modules/authority/recovery/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import(
    '../../../src/modules/authority/recovery/public'
  )>()

  class ProbeProductionRecoveryService {
    readonly #accountFacts: RecoveryAccountFactsPort
    readonly #authority: RecoveryAuthorityPort

    constructor(options: ProductionRecoveryServiceOptions) {
      this.#accountFacts = options.accountFacts
      this.#authority = options.authority
    }

    async recordVerifiedApproval(input: VerifiedBreakGlassApproval): Promise<VerifiedBreakGlassApproval> {
      await this.#accountFacts.resolve(input.accountRef)
      return input
    }

    async authorize(input: AuthorizeRecoveryRequest): Promise<RecoveryAdmission> {
      return await this.#authority.admitConsequence({
        grantRef: input.grantRef,
        expectedGeneration: input.expectedGrantGeneration,
        context: input.context,
        requiredScopes: [`recovery:${input.action}`],
        resourceRefs: [`account:${input.accountRef}`],
        budgetAmount: 0,
      }) as unknown as RecoveryAdmission
    }
  }

  return { ...actual, ProductionRecoveryService: ProbeProductionRecoveryService }
})

const ACCOUNT = accountRef('acc_00000000000040008000000000000041')
const OWNER = principalRef('prn_00000000000040008000000000000041')
const OPERATOR_ONE = principalRef('prn_00000000000040008000000000000042')
const OPERATOR_TWO = principalRef('prn_00000000000040008000000000000043')

const request: AuthorizeRecoveryRequest = {
  action: 'isolate',
  accountRef: ACCOUNT,
  subjectPrincipalRef: OWNER,
  grantRef: delegationGrantRef('grt_00000000000040008000000000000041'),
  expectedGrantGeneration: 4,
  approvalRefs: ['approval:one', 'approval:two'],
  context: {
    actorPrincipalRef: OPERATOR_ONE,
    activeAccountRef: ACCOUNT,
    correlationRef: 'recovery:adapter',
    idempotencyRef: 'recovery:adapter:one',
  },
}

const verifiedApproval: VerifiedBreakGlassApproval = {
  approvalRef: 'approval:one',
  accountRef: ACCOUNT,
  subjectPrincipalRef: OWNER,
  operatorPrincipalRef: OPERATOR_ONE,
  action: 'isolate',
  recoveryPolicyRevision: 7,
  frozenAccountRevision: 12,
  verificationRef: 'verification:approval:one',
  lifecycle: 'verified',
  verifiedAt: 1_050,
  expiresAt: 2_000,
}

async function seededBackend() {
  const backend = convexTest(schema, convexModules)
  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef: OPERATOR_ONE,
      kind: 'human',
      displayName: 'Active operator',
      lifecycle: 'active',
      revision: 1,
      createdAt: 900,
      updatedAt: 900,
    })
    await ctx.db.insert('principals', {
      principalRef: OPERATOR_TWO,
      kind: 'human',
      displayName: 'Suspended operator',
      lifecycle: 'suspended',
      revision: 2,
      createdAt: 900,
      updatedAt: 1_000,
    })
  })
  return backend
}

afterEach(() => {
  adapterProbe.mode = 'record-unavailable'
  vi.restoreAllMocks()
})

describe('recovery break-glass private adapter defenses', () => {
  it('keeps approval recording isolated from account-fact and authority callbacks', async () => {
    adapterProbe.mode = 'record-unavailable'
    const backend = await seededBackend()
    const { recordVerifiedRecoveryApprovalHandler } = await import('../../../convex/recoveryBreakGlass')

    await expect(backend.run(async (ctx) =>
      await recordVerifiedRecoveryApprovalHandler(ctx, verifiedApproval)))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
  })

  it.each([
    ['context-mismatch', 'delegation_actor_mismatch'],
    ['root-issuer', 'delegation_actor_mismatch'],
    ['principal-active', 'adapter_probe_complete'],
    ['principal-inactive', 'delegation_actor_mismatch'],
  ] as const)('fails closed for the %s adapter probe', async (mode, expected) => {
    adapterProbe.mode = mode
    const backend = await seededBackend()
    const { authorizeRecoveryHandler } = await import('../../../convex/recoveryBreakGlass')

    await expect(backend.run(async (ctx) => await authorizeRecoveryHandler(ctx, request)))
      .rejects.toThrow(expected)
  })
})
