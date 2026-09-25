import { afterEach, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests, type ConvexSourceTransport } from '@/lib/server/convex-source'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  recordOrganizationInvitationCreatedThroughSource,
  recordOrganizationInvitationRevokedThroughSource,
} from '@/modules/workspace-invitation/organization-invitation-observation'
import {
  recordOrganizationMembershipCreatedThroughSource,
  recordOrganizationMembershipUpdatedThroughSource,
  recordOrganizationMembershipDeletedThroughSource,
} from '@/modules/workspace-membership/organization-membership-observation'
import { createInteractiveAuthorityBackend } from '../../helpers/interactive-authority-runtime'

afterEach(() => vi.unstubAllEnvs())

it('routes Clerk invitation and membership observations to their Convex mutations with valid service authority', async () => {
  vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'clerk-observation-routing-test-key-material')
  const backend = createInteractiveAuthorityBackend()
  const restore = setPublicSourceTransportForTests({
    query: backend.query as ConvexSourceTransport['query'],
    mutation: backend.mutation as ConvexSourceTransport['mutation'],
    action: backend.action as ConvexSourceTransport['action'],
  })
  const hash = canonicalDigest({ delivery: 'clerk-observation-routing' })
  const common = {
    clerkOrgId: 'org_unknown_observation_routing',
    deliveryRefHash: hash,
    role: 'org:member' as const,
    observedAt: Date.now(),
  }
  const invitation = {
    ...common,
    invitationRefHash: hash,
    emailHash: hash,
  }
  const membership = {
    ...common,
    membershipRefHash: hash,
    providerIdentifier: 'https://clerk.example.test|user_observation_routing',
  }

  try {
    expect(await recordOrganizationInvitationCreatedThroughSource(invitation)).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(await recordOrganizationInvitationRevokedThroughSource(invitation)).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(await recordOrganizationMembershipCreatedThroughSource(membership)).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(await recordOrganizationMembershipUpdatedThroughSource(membership)).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(await recordOrganizationMembershipDeletedThroughSource(membership)).toEqual({ kind: 'accepted', status: 'ignored' })
  } finally {
    restore()
  }
})
