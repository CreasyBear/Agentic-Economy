/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const session = vi.hoisted(() => ({
  fullName: null as string | null,
  workspace: null as null | {
    accountRef: string
    displayName: string
    callerIsOwner: boolean
    clerkOrgId: string | null
  },
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ orgId: null, isLoaded: true }),
  useUser: () => ({ user: { fullName: session.fullName } }),
}))

vi.mock('@/components/ae/layout/app-shell/workspace-identity.functions', () => ({
  readWorkspaceHeaderIdentityServer: () => Promise.resolve(session.workspace),
}))

import { AeWorkspaceIdentity } from '@/components/ae/layout/app-shell/AeWorkspaceIdentity'

afterEach(() => {
  cleanup()
  session.fullName = null
  session.workspace = null
})

describe('AeWorkspaceIdentity', () => {
  it('does not suffix a workspace label when the person name is empty', async () => {
    session.workspace = {
      accountRef: 'acc_1',
      displayName: "R10 Smoke Owner's workspace",
      callerIsOwner: true,
      clerkOrgId: null,
    }
    render(<AeWorkspaceIdentity />)
    await waitFor(() => {
      expect(screen.getByLabelText("Workspace: R10 Smoke Owner's workspace")).toBeInTheDocument()
    })
  })

  it('suffixes a real person name once and leaves an organisation label unchanged', async () => {
    session.fullName = 'Ada Lovelace'
    session.workspace = {
      accountRef: 'acc_1',
      displayName: 'Acme',
      callerIsOwner: true,
      clerkOrgId: null,
    }
    const personal = render(<AeWorkspaceIdentity />)
    await waitFor(() => {
      expect(screen.getByLabelText('Workspace: Ada Lovelace’s workspace')).toBeInTheDocument()
    })
    personal.unmount()

    session.fullName = null
    session.workspace = { ...session.workspace, clerkOrgId: 'org_1', displayName: 'Acme' }
    render(<AeWorkspaceIdentity />)
    await waitFor(() => {
      expect(screen.getByLabelText('Workspace: Acme')).toBeInTheDocument()
    })
  })
})
