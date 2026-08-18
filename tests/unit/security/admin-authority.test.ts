/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { canBootstrapOwnerAdmin, requireAdminAuthority } from '@/modules/security/internal/admin-authority'
import {
  bootstrapOwnerAdmin,
  createEmptyAdminAuthorityState,
  grantAdminMembership,
  revokeAdminMembership,
} from '@/modules/security/public'
import type { AdminMembership } from '@/modules/security/public'
import { resolveAdminAuthority } from '../../../convex/authz'
import schema from '../../../convex/schema'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

describe('admin authority contract', () => {
  it('does not grant authority from env or session alone', () => {
    expect(requireAdminAuthority(undefined, 'set_operator_control')).toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })
  })

  it('enforces the source-owned role and action matrix', () => {
    expect(requireAdminAuthority(activeMembership('support'), 'read_admin_readbacks')).toMatchObject({ kind: 'allowed' })
    expect(requireAdminAuthority(activeMembership('support'), 'set_operator_control')).toEqual({
      kind: 'denied',
      reason: 'action_not_allowed',
    })
    expect(requireAdminAuthority(activeMembership('reviewer'), 'annotate_triage')).toEqual({
      kind: 'denied',
      reason: 'action_not_allowed',
    })
    expect(requireAdminAuthority(activeMembership('owner_admin'), 'register_capability_contract')).toMatchObject({ kind: 'allowed' })
    expect(requireAdminAuthority(activeMembership('support'), 'register_capability_contract')).toEqual({
      kind: 'denied',
      reason: 'action_not_allowed',
    })
  })

  it('allows bootstrap only for preauthorized principal while no owner admin exists', () => {
    expect(
      canBootstrapOwnerAdmin('user_allowed', {
        authorizedClerkUserIds: ['user_allowed'],
        activeOwnerAdminCount: 0,
      })
    ).toBe(true)
    expect(
      canBootstrapOwnerAdmin('random_user', {
        authorizedClerkUserIds: ['user_allowed'],
        activeOwnerAdminCount: 0,
      })
    ).toBe(false)
    expect(
      canBootstrapOwnerAdmin('user_allowed', {
        authorizedClerkUserIds: ['user_allowed'],
        activeOwnerAdminCount: 1,
      })
    ).toBe(false)
  })

  it('denies arbitrary first caller bootstrap, allows one preauthorized bootstrap, then denies the second attempt', () => {
    const state = createEmptyAdminAuthorityState()

    const arbitrary = bootstrapOwnerAdmin(state, {
      clerkUserId: 'random_user',
      tokenIdentifier: 'clerk|random_user',
      authorizedClerkUserIds: ['user_allowed'],
      reasonCode: 'source_owned_setup',
      evidenceRefs: ['local-config:ADMIN_BOOTSTRAP_PRINCIPAL_IDS'],
      operationKey: 'op:admin:bootstrap:random',
      correlationId: 'corr:admin:bootstrap:random',
      now: 1,
    })

    expect(arbitrary).toMatchObject({
      kind: 'error',
      code: 'admin_bootstrap_denied',
      reason: 'unauthorized_bootstrap_principal',
      auditEvent: { eventType: 'admin.action_denied', actorKind: 'anonymous' },
    })
    expect(state.adminMemberships).toHaveLength(0)

    const allowed = bootstrapOwnerAdmin(state, {
      clerkUserId: 'user_allowed',
      tokenIdentifier: 'clerk|user_allowed',
      authorizedClerkUserIds: ['user_allowed'],
      reasonCode: 'source_owned_setup',
      evidenceRefs: ['local-config:ADMIN_BOOTSTRAP_PRINCIPAL_IDS'],
      operationKey: 'op:admin:bootstrap:allowed',
      correlationId: 'corr:admin:bootstrap:allowed',
      now: 2,
    })

    expect(allowed).toMatchObject({
      kind: 'ok',
      code: 'admin_membership_bootstrapped',
      membership: { role: 'owner_admin', state: 'active', evidenceRef: 'local-config:ADMIN_BOOTSTRAP_PRINCIPAL_IDS' },
      auditEvent: { eventType: 'admin.membership_bootstrapped', beforeState: 'none', afterState: 'active:owner_admin' },
    })

    const second = bootstrapOwnerAdmin(state, {
      clerkUserId: 'another_allowed_user',
      tokenIdentifier: 'clerk|another_allowed_user',
      authorizedClerkUserIds: ['another_allowed_user'],
      reasonCode: 'source_owned_setup',
      evidenceRefs: ['local-config:ADMIN_BOOTSTRAP_PRINCIPAL_IDS'],
      operationKey: 'op:admin:bootstrap:second',
      correlationId: 'corr:admin:bootstrap:second',
      now: 3,
    })

    expect(second).toMatchObject({
      kind: 'error',
      code: 'admin_bootstrap_denied',
      reason: 'owner_admin_already_exists',
      auditEvent: { eventType: 'admin.action_denied' },
    })
    expect(state.adminMemberships.filter((membership) => membership.role === 'owner_admin' && membership.state === 'active')).toHaveLength(1)
  })

  it('requires owner_admin for grant and revoke and audits support/reviewer destructive denials', () => {
    const state = createEmptyAdminAuthorityState()
    const owner = activeMembership('owner_admin')
    state.adminMemberships.push(owner)

    const grant = grantAdminMembership(state, {
      actorMembership: owner,
      targetClerkUserId: 'support_user',
      targetTokenIdentifier: 'clerk|support_user',
      role: 'support',
      reasonCode: 'support_queue_access',
      evidenceRefs: ['ticket:admin-access'],
      operationKey: 'op:admin:grant:support',
      correlationId: 'corr:admin:grant:support',
      now: 10,
    })

    expect(grant).toMatchObject({
      kind: 'ok',
      code: 'admin_membership_granted',
      membership: { clerkUserId: 'support_user', role: 'support', state: 'active' },
      auditEvent: { eventType: 'admin.membership_granted' },
    })

    const support = state.adminMemberships.find((membership) => membership.clerkUserId === 'support_user')
    const supportRevoke = revokeAdminMembership(state, {
      actorMembership: support,
      targetClerkUserId: 'user_1',
      reasonCode: 'not_allowed',
      evidenceRefs: ['ticket:denied'],
      operationKey: 'op:admin:revoke:support-denied',
      correlationId: 'corr:admin:revoke:support-denied',
      now: 11,
    })

    expect(supportRevoke).toMatchObject({
      kind: 'error',
      code: 'admin_action_denied',
      reason: 'action_not_allowed',
      auditEvent: { eventType: 'admin.action_denied', targetRef: 'user_1' },
    })

    const reviewerGrant = grantAdminMembership(state, {
      actorMembership: activeMembership('reviewer'),
      targetClerkUserId: 'reviewer_target',
      targetTokenIdentifier: 'clerk|reviewer_target',
      role: 'support',
      reasonCode: 'not_allowed',
      evidenceRefs: ['ticket:denied'],
      operationKey: 'op:admin:grant:reviewer-denied',
      correlationId: 'corr:admin:grant:reviewer-denied',
      now: 12,
    })

    expect(reviewerGrant).toMatchObject({
      kind: 'error',
      code: 'admin_action_denied',
      reason: 'action_not_allowed',
      auditEvent: { eventType: 'admin.action_denied' },
    })

    const revoke = revokeAdminMembership(state, {
      actorMembership: owner,
      targetClerkUserId: 'support_user',
      reasonCode: 'access_no_longer_needed',
      evidenceRefs: ['ticket:admin-access-closed'],
      operationKey: 'op:admin:revoke:support',
      correlationId: 'corr:admin:revoke:support',
      now: 13,
    })

    expect(revoke).toMatchObject({
      kind: 'ok',
      code: 'admin_membership_revoked',
      membership: { clerkUserId: 'support_user', state: 'revoked', revokedBy: 'user_1' },
      auditEvent: { eventType: 'admin.membership_revoked' },
    })
    expect(state.auditEvents.map((event) => event.eventType)).toEqual([
      'admin.membership_granted',
      'admin.action_denied',
      'admin.action_denied',
      'admin.membership_revoked',
    ])
  })

  it('requires reason and evidence for membership changes', () => {
    expect(
      grantAdminMembership(createEmptyAdminAuthorityState(), {
        actorMembership: activeMembership('owner_admin'),
        targetClerkUserId: 'support_user',
        targetTokenIdentifier: 'clerk|support_user',
        role: 'support',
        reasonCode: ' ',
        evidenceRefs: ['ticket:admin-access'],
        operationKey: 'op:admin:grant:invalid-reason',
        correlationId: 'corr:admin:grant:invalid-reason',
        now: 10,
      })
    ).toMatchObject({ kind: 'error', code: 'admin_invalid_reason' })

    expect(
      grantAdminMembership(createEmptyAdminAuthorityState(), {
        actorMembership: activeMembership('owner_admin'),
        targetClerkUserId: 'support_user',
        targetTokenIdentifier: 'clerk|support_user',
        role: 'support',
        reasonCode: 'support_queue_access',
        evidenceRefs: [],
        operationKey: 'op:admin:grant:missing-evidence',
        correlationId: 'corr:admin:grant:missing-evidence',
        now: 10,
      })
    ).toMatchObject({ kind: 'error', code: 'admin_missing_evidence' })
  })

  it('fails closed for admin membership once listed memberships were unlisted', async () => {
    const backend = convexTest(schema, convexModules)

    const legacyAuthority = await backend.withIdentity({
      subject: 'legacy-admin',
      issuer: 'https://clerk.example.test',
      tokenIdentifier: 'clerk|legacy-admin',
    }).query((ctx) => resolveAdminAuthority({ db: ctx.db, auth: ctx.auth }, 'set_operator_control'))
    expect(legacyAuthority).toEqual({ kind: 'denied', reason: 'missing_membership' })

    const currentAuthority = await backend.withIdentity({
      subject: 'current-admin',
      issuer: 'https://clerk.example.test',
      tokenIdentifier: 'clerk|current-admin',
    }).query((ctx) => resolveAdminAuthority({ db: ctx.db, auth: ctx.auth }, 'set_operator_control'))
    expect(currentAuthority).toEqual({ kind: 'denied', reason: 'missing_membership' })
  })
})

function activeMembership(role: AdminMembership['role']): AdminMembership {
  return {
    clerkUserId: 'user_1',
    tokenIdentifier: 'clerk|user_1',
    role,
    state: 'active',
    grantedBy: 'bootstrap',
    grantedAt: 1,
  }
}
