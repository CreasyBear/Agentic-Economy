import { renderToStaticMarkup } from 'react-dom/server'
import { getFunctionName } from 'convex/server'
import { afterEach, expect, it, vi } from 'vitest'
import type * as TanstackReactStartModule from '@tanstack/react-start'

const boundary = vi.hoisted(() => ({
  callSourceQuery: vi.fn(),
  clerkClient: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: vi.fn(),
  clerkClient: boundary.clerkClient,
}))
vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof TanstackReactStartModule>()),
  createServerFn: () => ({
    handler: (handler: unknown) => handler,
    inputValidator: () => ({ handler: (handler: unknown) => handler }),
  }),
}))
vi.mock('@/lib/server/convex-source', () => ({ callSourceQuery: boundary.callSourceQuery }))

import { TeamRolesPage } from './TeamRolesPage'
import { readTeamRolesServer } from './team-roles.functions'

afterEach(() => {
  vi.clearAllMocks()
})

it('renders authoritative members and binding status when Clerk name lookup fails', async () => {
  boundary.callSourceQuery.mockImplementation((query) => {
    if (getFunctionName(query) === 'workspaceTeam:listDirectory') return {
      owner: {
        kind: 'owner', ownershipRef: 'ownership:1', displayName: 'Alex Owner',
        email: 'alex@example.test', clerkUserId: 'user_owner', joinedAt: 1,
      },
      members: [{
        kind: 'member', membershipRef: 'membership:1', displayName: 'user_former_member',
        email: 'member@example.test', clerkUserId: 'user_former_member', role: 'admin', joinedAt: 2,
      }],
    }
    if (getFunctionName(query) === 'workspaceTeam:invitationContext') return { kind: 'organization_unset' }
    throw new Error('Unexpected Convex query')
  })
  boundary.clerkClient.mockReturnValue({ users: { getUser: boundary.getUser } })
  boundary.getUser.mockImplementation((userId) => userId === 'user_owner'
    ? Promise.resolve({ firstName: 'Alex', lastName: 'Owner', primaryEmailAddress: { emailAddress: 'alex@example.test' } })
    : Promise.reject(new Error('Clerk user lookup unavailable')))

  const view = await readTeamRolesServer()
  expect(view).toEqual({
    members: [
      { key: 'ownership:1', name: 'Alex Owner', email: 'alex@example.test', role: 'Owner', joinedAt: 1 },
      { key: 'membership:1', name: 'user_former_member', email: 'member@example.test', role: 'Admin', joinedAt: 2 },
    ],
    inviteAvailability: 'organization_unset',
  })
  const markup = renderToStaticMarkup(<TeamRolesPage {...view} />)
  expect(markup).toContain('user_former_member')
  expect(markup).toContain('Admin')
  expect(markup).not.toContain('Invite member')
})
