import type { GenericDatabaseReader } from 'convex/server'

import {
  accountRef,
  membershipRef,
  ownershipRef,
} from '../../../../src/modules/principal-account/account/public'
import {
  credentialRef,
  externalIdentityBindingRef,
} from '../../../../src/modules/principal-account/external-identity/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import type {
  AccountRef,
  OwnershipRef,
  PrincipalRef,
} from '../../../../src/modules/principal-account/public'
import type { InteractiveBusinessAuthorityContext } from '../../../../src/modules/business/public'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { DataModel, Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { InteractiveAuthorityError, type InteractiveAuthorityErrorCode } from './errors'
import { interactiveAuthorityContextValue, type InteractiveAuthorityFacts } from './contracts'

export type AuthorityDb = GenericDatabaseReader<DataModel>
export type AuthorityMutationSource = AuthorityDb | Pick<MutationCtx, 'db' | 'scheduler'>

export type AccessFact =
  | Readonly<{ kind: 'ownership'; row: Doc<'accountOwnerships'> }>
  | Readonly<{ kind: 'membership'; row: Doc<'memberships'> }>

export function freezeInteractiveContext(
  context: InteractiveBusinessAuthorityContext,
): InteractiveBusinessAuthorityContext {
  return Object.freeze({
    ...context,
    revision: Object.freeze(context.revision),
    provenance: Object.freeze(context.provenance),
  })
}

export function interactiveAuthorityContextFromValue(
  input: typeof interactiveAuthorityContextValue.type,
): InteractiveBusinessAuthorityContext {
  const accessRef = input.provenance.accessKind === 'ownership'
    ? ownershipRef(input.provenance.accessRef)
    : membershipRef(input.provenance.accessRef)
  return freezeInteractiveContext({
    principalRef: principalRef(input.principalRef),
    accountRef: accountRef(input.accountRef),
    revision: { ...input.revision },
    provenance: {
      ...input.provenance,
      accessRef,
      currentOwnershipRef: ownershipRef(input.provenance.currentOwnershipRef),
    },
  })
}

export function currentContextAtTrustedServerTime(
  facts: InteractiveAuthorityFacts,
  now: number,
): InteractiveBusinessAuthorityContext | null {
  if (!Number.isSafeInteger(now)
    || now < 0
    || now < facts.credentialIssuedAt
    || now >= facts.credentialExpiresAt) return null
  return freezeInteractiveContext({
    ...facts.context,
    provenance: {
      ...facts.context.provenance,
      resolvedAt: now,
    },
  })
}

export function sameScheduledAuthority(
  current: InteractiveBusinessAuthorityContext,
  expected: InteractiveBusinessAuthorityContext,
): boolean {
  return current.principalRef === expected.principalRef
    && current.accountRef === expected.accountRef
    && current.provenance.providerNamespace === expected.provenance.providerNamespace
    && current.provenance.bindingRef === expected.provenance.bindingRef
    && current.provenance.credentialRef === expected.provenance.credentialRef
    && current.provenance.credentialGeneration === expected.provenance.credentialGeneration
    && current.provenance.accessKind === expected.provenance.accessKind
    && current.provenance.accessRef === expected.provenance.accessRef
    && current.provenance.currentOwnershipRef === expected.provenance.currentOwnershipRef
    && current.revision.binding === expected.revision.binding
    && current.revision.credential === expected.revision.credential
    && current.revision.principal === expected.revision.principal
    && current.revision.account === expected.revision.account
    && current.revision.access === expected.revision.access
    && current.revision.currentOwnership === expected.revision.currentOwnership
    && current.revision.currentOwnerPrincipal === expected.revision.currentOwnerPrincipal
}

export function requireCanonicalRef<Value>(
  value: string,
  parse: (candidate: string) => Value,
): Value {
  try {
    return parse(value)
  } catch (cause) {
    degradeBackend(cause, undefined, { site: 'requireCanonicalRef', reason: 'invalid_response' })
    throw new InteractiveAuthorityError('authority_fact_invalid')
  }
}

export function assertCanonicalFactNumbers(
  positiveIntegers: readonly number[],
): void {
  const positive = positiveIntegers.every((value) => Number.isSafeInteger(value) && value > 0)
  if (!positive) {
    throw new InteractiveAuthorityError('authority_fact_invalid')
  }
}

export function requireExactlyOne<Value>(
  rows: readonly Value[],
  missingCode: InteractiveAuthorityErrorCode,
  ambiguousCode: InteractiveAuthorityErrorCode,
): Value {
  if (rows.length === 0) throw new InteractiveAuthorityError(missingCode)
  if (rows.length !== 1) throw new InteractiveAuthorityError(ambiguousCode)
  const [row] = rows
  if (row === undefined) throw new InteractiveAuthorityError(missingCode)
  return row
}

export function assertCurrentOwnership(
  account: Doc<'accounts'>,
  ownership: Doc<'accountOwnerships'>,
): void {
  if (ownership.ownershipRef !== account.currentOwnershipRef
    || ownership.accountRef !== account.accountRef
    || ownership.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('ownership_mismatch')
  }
}

export function assertAccessIntegrity(
  access: AccessFact,
  canonicalPrincipalRef: PrincipalRef,
  canonicalAccountRef: AccountRef,
  currentOwnershipRef: OwnershipRef,
): void {
  const actual = access.kind === 'ownership'
    ? [access.row.accountRef, access.row.lifecycle, access.row.ownerPrincipalRef, access.row.ownershipRef]
    : [access.row.accountRef, access.row.lifecycle, access.row.memberPrincipalRef]
  const expected = access.kind === 'ownership'
    ? [canonicalAccountRef, 'active', canonicalPrincipalRef, currentOwnershipRef]
    : [canonicalAccountRef, 'active', canonicalPrincipalRef]
  if (actual.join('|') !== expected.join('|')) {
    throw new InteractiveAuthorityError('ownership_mismatch')
  }
}

export async function requireCurrentOwnerActive(
  db: AuthorityDb,
  ownerPrincipalRef: PrincipalRef,
): Promise<Doc<'principals'>> {
  const principalRows = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', ownerPrincipalRef))
    .take(2)
  if (principalRows.length !== 1) throw new InteractiveAuthorityError('ownership_mismatch')
  const [owner] = principalRows
  if (owner === undefined || owner.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('ownership_mismatch')
  }
  return owner
}

export { accountRef, credentialRef, externalIdentityBindingRef, ownershipRef, principalRef }
