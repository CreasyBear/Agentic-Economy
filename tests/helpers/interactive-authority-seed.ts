import type { TestConvex } from 'convex-test'

import schema from '../../convex/schema'
import { interactiveCredentialExpiryNonce } from '../../convex/interactiveCredentialLifecycle'

export const INTERACTIVE_AUTHORITY_NOW = 10_000
export const INTERACTIVE_PRINCIPAL_REF = `prn_${'1'.repeat(32)}`
export const INTERACTIVE_ACCOUNT_REF = `acc_${'2'.repeat(32)}`
export const INTERACTIVE_OWNERSHIP_REF = `own_${'3'.repeat(32)}`
export const INTERACTIVE_MEMBERSHIP_REF = `mem_${'4'.repeat(32)}`
export const INTERACTIVE_BINDING_REF = `eib_${'5'.repeat(32)}`
export const INTERACTIVE_CREDENTIAL_REF = `crd_${'6'.repeat(32)}`
export const INTERACTIVE_TOKEN_IDENTIFIER = 'https://clerk.example.test|user_sam'

export type InteractiveAuthoritySeedOptions = Readonly<{
  access?: 'ownership' | 'membership'
  omit?: 'binding' | 'credential' | 'principal' | 'access' | 'account' | 'currentOwnership'
  duplicate?: 'binding' | 'credential' | 'principal' | 'access' | 'account' | 'currentOwnership'
  bindingLifecycle?: 'active' | 'revoked'
  bindingGeneration?: number
  bindingRevision?: number
  providerState?: 'active' | 'disabled' | 'unknown'
  credentialBindingRef?: string
  credentialPrincipalRef?: string
  credentialGeneration?: number
  credentialLifecycle?: 'active' | 'stale'
  credentialType?: 'provider_token' | 'api_key'
  omitExpiryMaterialization?: boolean
  issuedAt?: number
  expiresAt?: number
  principalLifecycle?: 'active' | 'suspended'
  principalKind?: 'human' | 'agent' | 'workload'
  addMembershipToOwnership?: boolean
  accountLifecycle?: 'active' | 'suspended'
  accountCurrentOwnershipRef?: string
  currentOwnershipAccountRef?: string
  currentOwnershipLifecycle?: 'active' | 'ended'
  currentOwnerPrincipalRef?: string
  currentOwnerLifecycle?: 'active' | 'suspended'
  staleActiveFormerOwner?: boolean
}>

type Backend = TestConvex<typeof schema>
type RunCtx = Parameters<Parameters<Backend['run']>[0]>[0]

export async function seedInteractiveAuthority(
  backend: Backend,
  options: InteractiveAuthoritySeedOptions = {},
): Promise<void> {
  await backend.run(async (ctx) => {
    const providerState = options.providerState === 'unknown'
      ? { kind: 'unknown' as const, value: 'future-state' }
      : { kind: 'known' as const, value: options.providerState ?? 'active' }

    if (options.omit !== 'binding') {
      await ctx.db.insert('externalIdentityBindings', {
        bindingRef: INTERACTIVE_BINDING_REF,
        principalRef: INTERACTIVE_PRINCIPAL_REF,
        providerNamespace: 'clerk/user',
        providerIdentifier: INTERACTIVE_TOKEN_IDENTIFIER,
        providerState,
        lifecycle: options.bindingLifecycle ?? 'active',
        credentialGeneration: options.bindingGeneration ?? 2,
        bindIdempotencyRef: 'bind:sam',
        revision: options.bindingRevision ?? 7,
        createdAt: 1,
        updatedAt: 2,
      })
      if (options.duplicate === 'binding') {
        await ctx.db.insert('externalIdentityBindings', {
          bindingRef: `eib_${'7'.repeat(32)}`,
          principalRef: INTERACTIVE_PRINCIPAL_REF,
          providerNamespace: 'clerk/user',
          providerIdentifier: INTERACTIVE_TOKEN_IDENTIFIER,
          providerState: { kind: 'known', value: 'active' },
          lifecycle: 'active',
          credentialGeneration: 2,
          bindIdempotencyRef: 'bind:sam:duplicate',
          revision: 1,
          createdAt: 1,
          updatedAt: 2,
        })
      }
    }

    if (options.omit !== 'credential') {
      const credential = {
        credentialRef: INTERACTIVE_CREDENTIAL_REF,
        bindingRef: options.credentialBindingRef ?? INTERACTIVE_BINDING_REF,
        principalRef: options.credentialPrincipalRef ?? INTERACTIVE_PRINCIPAL_REF,
        type: options.credentialType ?? 'provider_token' as const,
        lifecycle: options.credentialLifecycle ?? 'active' as const,
        generation: options.credentialGeneration ?? options.bindingGeneration ?? 2,
        issueIdempotencyRef: 'credential:sam',
        revision: 6,
        issuedAt: options.issuedAt ?? 5,
        expiresAt: options.expiresAt ?? 20_000,
        ...(options.omitExpiryMaterialization === true ? {} : {
          expiryMaterialization: {
            state: 'scheduled' as const,
            credentialGeneration: options.credentialGeneration ?? options.bindingGeneration ?? 2,
            credentialExpiresAt: options.expiresAt ?? 20_000,
            scheduleNonce: Number.isFinite(options.expiresAt ?? 20_000)
              ? interactiveCredentialExpiryNonce({
                  bindingRef: options.credentialBindingRef ?? INTERACTIVE_BINDING_REF,
                  credentialRef: INTERACTIVE_CREDENTIAL_REF,
                  generation: options.credentialGeneration ?? options.bindingGeneration ?? 2,
                  expiresAt: options.expiresAt ?? 20_000,
                } as never)
              : 'sha256:invalid-expiry-fixture',
            scheduleRef: 'scheduled:interactive-credential-expiry',
            materializedAt: 6,
          },
        }),
        updatedAt: 5,
      }
      await ctx.db.insert('credentials', credential)
      if (options.duplicate === 'credential') {
        await ctx.db.insert('credentials', {
          ...credential,
          credentialRef: `crd_${'7'.repeat(32)}`,
          issueIdempotencyRef: 'credential:sam:duplicate',
        })
      }
    }

    if (options.omit !== 'principal') {
      const principal = {
        principalRef: INTERACTIVE_PRINCIPAL_REF,
        kind: options.principalKind ?? 'human' as const,
        displayName: 'Sam canonical principal',
        lifecycle: options.principalLifecycle ?? 'active' as const,
        revision: 5,
        createdAt: 1,
        updatedAt: 4,
      }
      await ctx.db.insert('principals', principal)
      if (options.duplicate === 'principal') await ctx.db.insert('principals', principal)
    }

    const access = options.access ?? 'ownership'
    if ((access === 'membership' || options.staleActiveFormerOwner === true)
      && options.currentOwnerPrincipalRef === undefined) {
      await ctx.db.insert('principals', {
        principalRef: `prn_${'8'.repeat(32)}`,
        kind: 'human',
        displayName: 'Current owner principal',
        lifecycle: options.currentOwnerLifecycle ?? 'active',
        revision: 2,
        createdAt: 1,
        updatedAt: 2,
      })
    }

    if (options.omit !== 'access') {
      if (access === 'ownership') {
        await insertOwnership(ctx, options)
        if (options.duplicate === 'access') {
          await insertOwnership(ctx, options, `own_${'7'.repeat(32)}`)
        }
      } else {
        await insertMembership(ctx)
        if (options.duplicate === 'access') await insertMembership(ctx, `mem_${'7'.repeat(32)}`)
      }
    }
    if (options.addMembershipToOwnership === true) await insertMembership(ctx)

    if (options.omit !== 'account') {
      const account = {
        accountRef: INTERACTIVE_ACCOUNT_REF,
        displayName: 'Canonical account',
        lifecycle: options.accountLifecycle ?? 'active' as const,
        recoveryPolicy: { kind: 'no_transfer' as const, revision: 1 },
        creationActorPrincipalRef: INTERACTIVE_PRINCIPAL_REF,
        creationIdempotencyRef: 'account:sam',
        initialOwnershipRef: INTERACTIVE_OWNERSHIP_REF,
        currentOwnershipRef: options.accountCurrentOwnershipRef
          ?? (options.staleActiveFormerOwner === true ? `own_${'9'.repeat(32)}` : INTERACTIVE_OWNERSHIP_REF),
        revision: 4,
        createdAt: 1,
        updatedAt: 4,
        lastAction: {
          actorPrincipalRef: INTERACTIVE_PRINCIPAL_REF,
          activeAccountRef: INTERACTIVE_ACCOUNT_REF,
          correlationRef: 'account:sam',
          idempotencyRef: 'account:sam',
        },
      }
      await ctx.db.insert('accounts', account)
      if (options.duplicate === 'account') await ctx.db.insert('accounts', account)
    }

    if (access === 'membership' && options.omit !== 'currentOwnership') {
      await insertOwnership(ctx, options)
      if (options.duplicate === 'currentOwnership') {
        await insertOwnership(ctx, options, INTERACTIVE_OWNERSHIP_REF)
      }
    }
    if (options.staleActiveFormerOwner === true) {
      await insertOwnership(ctx, {
        ...options,
        currentOwnerPrincipalRef: `prn_${'8'.repeat(32)}`,
      }, `own_${'9'.repeat(32)}`)
    }
  })
}

async function insertOwnership(
  ctx: RunCtx,
  options: InteractiveAuthoritySeedOptions,
  ref = INTERACTIVE_OWNERSHIP_REF,
): Promise<void> {
  await ctx.db.insert('accountOwnerships', {
    ownershipRef: ref,
    accountRef: options.currentOwnershipAccountRef ?? INTERACTIVE_ACCOUNT_REF,
    ownerPrincipalRef: options.currentOwnerPrincipalRef
      ?? (options.access === 'membership' ? `prn_${'8'.repeat(32)}` : INTERACTIVE_PRINCIPAL_REF),
    lifecycle: options.currentOwnershipLifecycle ?? 'active',
    changeKind: 'creation',
    revision: 3,
    createdAt: 1,
    createdBy: {
      actorPrincipalRef: INTERACTIVE_PRINCIPAL_REF,
      activeAccountRef: INTERACTIVE_ACCOUNT_REF,
      correlationRef: 'ownership:sam',
      idempotencyRef: 'ownership:sam',
    },
  })
}

async function insertMembership(
  ctx: RunCtx,
  ref = INTERACTIVE_MEMBERSHIP_REF,
): Promise<void> {
  await ctx.db.insert('memberships', {
    membershipRef: ref,
    accountRef: INTERACTIVE_ACCOUNT_REF,
    memberPrincipalRef: INTERACTIVE_PRINCIPAL_REF,
    lifecycle: 'active',
    revision: 8,
    createdAt: 1,
    createdBy: {
      actorPrincipalRef: INTERACTIVE_PRINCIPAL_REF,
      activeAccountRef: INTERACTIVE_ACCOUNT_REF,
      correlationRef: 'membership:sam',
      idempotencyRef: 'membership:sam',
    },
  })
}
