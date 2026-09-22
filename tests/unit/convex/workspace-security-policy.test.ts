import { makeFunctionReference, type UserIdentity } from 'convex/server'
import {
  describe,
  expect,
  it,
} from 'vitest'

import type { ClerkFactorEvidence } from '../../../convex/lib/consequenceProof'
import { InteractiveAuthorityError } from '../../../convex/interactiveAuthority'
import { assertStepUpForSensitiveAction } from '../../../convex/workspaceSecurity'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const ACCOUNT_B = `acc_${'b'.repeat(32)}`
const OWNERSHIP_B = `own_${'b'.repeat(32)}`

const freshMfa: ClerkFactorEvidence = { firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 1 }
const staleMfa: ClerkFactorEvidence = { firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 11 }
const noMfa: ClerkFactorEvidence = { firstFactorAgeMinutes: 1, secondFactorAgeMinutes: -1 }
const freshFirst: ClerkFactorEvidence = { firstFactorAgeMinutes: 0, secondFactorAgeMinutes: -1 }

type PolicyView = Readonly<{
  accountRef: string
  requireMfaForMembers: boolean
  revision: number
  updatedAt: number | null
}>

type PolicyUpdateReceipt = Readonly<{
  kind: 'updated' | 'replayed'
  revision: number
  requireMfaForMembers: boolean
}>

type UpdatePolicyInput = Readonly<{
  requireMfaForMembers: boolean
  factorEvidence: ClerkFactorEvidence
  expectedRevision: number
  correlationRef: string
  idempotencyRef: string
}>

type StepUpAdmission =
  | Readonly<{
    kind: 'allowed'
    requireMfaForMembers: boolean
    policyRevision?: number
  }>
  | Readonly<{
    kind: 'refused'
    code: 'mfa_reverification_required'
  }>

const readPolicyRef = makeFunctionReference<
  'query',
  Record<string, never>,
  PolicyView
>('workspaceSecurity:readPolicy')

const updatePolicyRef = makeFunctionReference<
  'mutation',
  UpdatePolicyInput,
  PolicyUpdateReceipt
>('workspaceSecurity:updatePolicy')

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

const correlationRef = (label: string) => `test:workspace-security:${label}`

const idempotencyRef = (label: string) => `idem:workspace-security:${label}`

async function readPolicy(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<PolicyView> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(readPolicyRef, {})
}

async function updatePolicy(
  backend: InteractiveAuthorityBackend,
  input: UpdatePolicyInput,
  presentedIdentity: UserIdentity = identity(),
): Promise<PolicyUpdateReceipt> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(updatePolicyRef, input)
}

async function expectPolicyRefusal(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

type PolicyRow = Readonly<{
  accountRef: string
  requireMfaForMembers: boolean
  revision: number
  idempotencyRef?: string
}>

async function listPolicyRows(backend: InteractiveAuthorityBackend): Promise<PolicyRow[]> {
  return await backend.run(async (ctx) =>
    (await (ctx.db as { query: (table: string) => { collect: () => Promise<PolicyRow[]> } })
      .query('accountSecurityPolicies')
      .collect()))
}

async function runAssertStepUp(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity,
  account = ACCOUNT_REF,
): Promise<StepUpAdmission> {
  return await backend.run(async (ctx) =>
    assertStepUpForSensitiveAction(ctx.db, presentedIdentity, {
      accountRef: account,
    }))
}

async function seedSecondOwnedAccount(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('accounts', {
      accountRef: ACCOUNT_B,
      displayName: 'Workspace B',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: PRINCIPAL_REF,
      creationIdempotencyRef: `account:${ACCOUNT_B}`,
      initialOwnershipRef: OWNERSHIP_B,
      currentOwnershipRef: OWNERSHIP_B,
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
      lastAction: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_B,
        correlationRef: `account:${ACCOUNT_B}`,
        idempotencyRef: `account:${ACCOUNT_B}`,
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: OWNERSHIP_B,
      accountRef: ACCOUNT_B,
      ownerPrincipalRef: PRINCIPAL_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: NOW,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_B,
        correlationRef: `ownership:${OWNERSHIP_B}`,
        idempotencyRef: `ownership:${OWNERSHIP_B}`,
      },
    })
    await ctx.db.insert('interactiveSessionSelections', {
      principalRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
      revision: 1,
      selectedAt: NOW,
      lastCorrelationRef: `session:${ACCOUNT_REF}`,
    })
  })
}

function enablePolicyPayload(
  overrides: Partial<UpdatePolicyInput> = {},
): UpdatePolicyInput {
  return {
    requireMfaForMembers: true,
    factorEvidence: freshMfa,
    expectedRevision: 0,
    correlationRef: correlationRef('enable'),
    idempotencyRef: idempotencyRef('enable'),
    ...overrides,
  }
}

describe('workspaceSecurity policy', () => {
  it('S1: unauthenticated readPolicy refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectPolicyRefusal(
      () => backend.query(readPolicyRef, {}),
      'identity_invalid',
    )
  })

  it('S2: unauthenticated updatePolicy refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectPolicyRefusal(
      () => backend.mutation(updatePolicyRef, enablePolicyPayload()),
      'identity_invalid',
    )
  })

  it('S3: seeded owner with no policy row reads default policy', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(readPolicy(backend)).resolves.toEqual({
      requireMfaForMembers: false,
      revision: 0,
      updatedAt: null,
      accountRef: ACCOUNT_REF,
    })
    expect(await listPolicyRows(backend)).toHaveLength(0)
  })

  it('S4: owner enables MFA policy with fresh evidence', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const receipt = await updatePolicy(backend, enablePolicyPayload())

    expect(receipt).toEqual({
      kind: 'updated',
      revision: 1,
      requireMfaForMembers: true,
    })
    await expect(readPolicy(backend)).resolves.toMatchObject({
      requireMfaForMembers: true,
      revision: 1,
      accountRef: ACCOUNT_REF,
    })
    expect(await listPolicyRows(backend)).toHaveLength(1)
  })

  it('S5: replaying identical enable payload is idempotent', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const payload = enablePolicyPayload()

    await updatePolicy(backend, payload)
    const replay = await updatePolicy(backend, payload)

    expect(replay).toEqual({
      kind: 'replayed',
      revision: 1,
      requireMfaForMembers: true,
    })
    expect(await listPolicyRows(backend)).toHaveLength(1)
  })

  it.each([
    ['noMfa', noMfa],
    ['freshFirst', freshFirst],
  ] as const)('S6: enable with %s refuses mfa_required', async (_label, factorEvidence) => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectPolicyRefusal(
      () => updatePolicy(backend, enablePolicyPayload({ factorEvidence })),
      'mfa_required',
    )
    expect(await listPolicyRows(backend)).toHaveLength(0)
  })

  it('S7: enable with stale MFA evidence refuses step_up_required', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectPolicyRefusal(
      () => updatePolicy(backend, enablePolicyPayload({ factorEvidence: staleMfa })),
      'step_up_required',
    )
  })

  it('S8: disable after enable without MFA refuses mfa_required', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await updatePolicy(backend, enablePolicyPayload())

    await expectPolicyRefusal(
      () => updatePolicy(backend, {
        requireMfaForMembers: false,
        factorEvidence: noMfa,
        expectedRevision: 1,
        correlationRef: correlationRef('disable-no-mfa'),
        idempotencyRef: idempotencyRef('disable-no-mfa'),
      }),
      'mfa_required',
    )
  })

  it('S9: owner disables MFA policy with fresh evidence', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await updatePolicy(backend, enablePolicyPayload())

    const receipt = await updatePolicy(backend, {
      requireMfaForMembers: false,
      factorEvidence: freshMfa,
      expectedRevision: 1,
      correlationRef: correlationRef('disable'),
      idempotencyRef: idempotencyRef('disable'),
    })

    expect(receipt).toEqual({
      kind: 'updated',
      revision: 2,
      requireMfaForMembers: false,
    })
  })

  it('S10: stale expectedRevision refuses policy_revision_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await updatePolicy(backend, enablePolicyPayload())

    await expectPolicyRefusal(
      () => updatePolicy(backend, enablePolicyPayload({
        expectedRevision: 0,
        correlationRef: correlationRef('stale-revision'),
        idempotencyRef: idempotencyRef('stale-revision'),
      })),
      'policy_revision_conflict',
    )
  })

  it('S11: membership-only caller cannot update policy', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    await expectPolicyRefusal(
      () => updatePolicy(backend, enablePolicyPayload()),
      'ownership_mismatch',
    )
  })

  it('S12: membership caller can read workspace policy', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    await expect(readPolicy(backend)).resolves.toMatchObject({
      accountRef: ACCOUNT_REF,
      requireMfaForMembers: false,
      revision: 0,
    })
  })

  it('S13: suspended account owner cannot update policy', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { accountLifecycle: 'suspended' })

    await expectPolicyRefusal(
      () => updatePolicy(backend, enablePolicyPayload()),
      'account_inactive',
    )
  })

  it('S14: agent principal cannot update workspace policy', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { principalKind: 'agent' })

    try {
      await updatePolicy(backend, enablePolicyPayload())
      throw new Error('expected agent principal policy refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(InteractiveAuthorityError)
      expect(['principal_kind_invalid', 'identity_invalid']).toContain(
        (error as InteractiveAuthorityError).code,
      )
    }
  })

  it('S15: empty correlationRef refuses correlation_ref_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectPolicyRefusal(
      () => updatePolicy(backend, enablePolicyPayload({ correlationRef: '' })),
      'correlation_ref_invalid',
    )
  })

  it('S16: assertStepUp admits fresh signed Clerk fva when workspace MFA policy is off', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(runAssertStepUp(backend, identity({ fva: [1, 1] }))).resolves.toEqual({
      kind: 'allowed',
      requireMfaForMembers: false,
    })
  })

  it('S17: assertStepUp refuses when the signed Clerk fva claim is absent', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(runAssertStepUp(backend, identity())).resolves.toEqual({
      kind: 'refused',
      code: 'mfa_reverification_required',
    })
  })

  it('S18: assertStepUp refuses when the signed Clerk fva has no second factor', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(runAssertStepUp(backend, identity({ fva: [1, -1] }))).resolves.toEqual({
      kind: 'refused',
      code: 'mfa_reverification_required',
    })
  })

  it('S20: policy on account A cannot exempt a sensitive action on account B', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedSecondOwnedAccount(backend)

    await updatePolicy(backend, enablePolicyPayload())

    await expect(runAssertStepUp(backend, identity({ fva: [1, -1] }), ACCOUNT_B)).resolves.toEqual({
      kind: 'refused',
      code: 'mfa_reverification_required',
    })
  })

  it('S21: readPolicy after update does not insert extra policy rows', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await updatePolicy(backend, enablePolicyPayload())
    expect(await listPolicyRows(backend)).toHaveLength(1)

    await readPolicy(backend)
    await readPolicy(backend)

    expect(await listPolicyRows(backend)).toHaveLength(1)
  })

  it.each([
    ['malformed', [1]],
    ['non-numeric', [1, '1']],
    ['stale-first-factor', [11, 1]],
    ['stale-second-factor', [1, 11]],
  ] as const)(
    'S22: assertStepUp refuses a %s signed Clerk fva claim',
    async (_label, fva) => {
      const backend = createBackend()
      await seedAuthority(backend)

      await expect(runAssertStepUp(backend, identity({ fva: [...fva] }))).resolves.toEqual({
        kind: 'refused',
        code: 'mfa_reverification_required',
      })
    },
  )
})
