/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const SUGGESTED_NAME = 'Canonical account'

const toastState = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

const routeState = vi.hoisted(() => ({
  Onboarding: null as ComponentType | null,
  search: {} as {
    redirect?: string
    step?: 1 | 2
    roleIntent?: 'buyer' | 'supplier'
    workspaceName?: string
  },
  navigate: vi.fn(),
  readState: {
    phase: 'incomplete' as 'incomplete' | 'complete',
    accountRef: 'acc_test_onboarding',
    suggestedWorkspaceName: 'Canonical account',
    roleIntent: 'buyer' as 'buyer' | 'supplier',
    redirectPath: '/owner' as '/owner' | '/owner/operations',
  },
  completeMutation: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    routeState.Onboarding = options.component
    return {
      ...options,
      options,
      useSearch: () => routeState.search,
    }
  },
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => routeState.navigate,
  useRouter: () => ({ routesByPath: {} }),
}))

vi.mock('convex/react', () => ({
  useQuery: vi.fn(() => {
    if (routeState.readState.phase === 'complete') {
      return {
        phase: 'complete',
        accountRef: routeState.readState.accountRef,
        roleIntent: routeState.readState.roleIntent,
        redirectPath: routeState.readState.redirectPath,
      }
    }
    return {
      phase: 'incomplete',
      accountRef: routeState.readState.accountRef,
      suggestedWorkspaceName: routeState.readState.suggestedWorkspaceName,
    }
  }),
  useMutation: () => routeState.completeMutation,
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}))

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastState.success(...args),
    error: (...args: unknown[]) => toastState.error(...args),
  },
}))

import '@/routes/onboarding'

function renderOnboarding() {
  const Component = routeState.Onboarding
  if (Component === null) throw new Error('Onboarding route was not captured.')
  return render(<Component />)
}

function selectRole(label: 'Buy with an Agent' | 'Provide a Tool') {
  fireEvent.click(screen.getByRole('radio', { name: label }))
}

function advanceToWorkspaceStep() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

afterEach(() => {
  cleanup()
  routeState.search = {}
  routeState.navigate.mockReset()
  routeState.completeMutation.mockReset()
  toastState.success.mockReset()
  toastState.error.mockReset()
  routeState.completeMutation.mockResolvedValue({
    kind: 'completed',
    roleIntent: 'buyer',
    redirectPath: '/owner',
  })
  routeState.readState = {
    phase: 'incomplete',
    accountRef: 'acc_test_onboarding',
    suggestedWorkspaceName: SUGGESTED_NAME,
    roleIntent: 'buyer',
    redirectPath: '/owner',
  }
})

describe('onboarding route', () => {
  it('R1: incomplete state renders role intent step with Continue enabled', () => {
    renderOnboarding()

    expect(screen.getByRole('heading', { name: 'Finish workspace' })).toBeTruthy()
    expect(screen.getByText('Step 1 of 2')).toBeTruthy()
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Buy with an Agent' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Provide a Tool' })).toBeTruthy()
    expect(screen.getByText('Unlocks Market, Agents, Credit, and Call records.')).toBeTruthy()
    expect(screen.getByText('Unlocks Provider Operations to publish Tools and manage Calls.')).toBeTruthy()
    expect(screen.queryByText(/You can change this in Settings/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', false)
  })

  it('R2: selecting a role opens the workspace name step', () => {
    renderOnboarding()

    selectRole('Buy with an Agent')
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', false)
    expect(routeState.navigate).toHaveBeenCalledWith({
      to: '/onboarding',
      replace: true,
      search: { roleIntent: 'buyer' },
    })
    advanceToWorkspaceStep()

    expect(screen.getByText('Step 2 of 2')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Workspace name' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Workspace name' })).toHaveProperty('value', SUGGESTED_NAME)
    expect(routeState.navigate).toHaveBeenCalledWith({
      to: '/onboarding',
      replace: true,
      search: {
        step: 2,
        roleIntent: 'buyer',
        workspaceName: SUGGESTED_NAME,
      },
    })
    expect(screen.getByText('Create workspace opens Workspace overview.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
    expect(screen.queryByText('Skip: you can set this later in Settings')).toBeNull()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  })


  it('R2c: agent-access redirect preselects buyer and Continue stays enabled', () => {
    routeState.search = { redirect: '/agent-access' }
    renderOnboarding()

    expect(screen.getByRole('radio', { name: 'Buy with an Agent' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', false)
  })

  it('R2d: owner redirect preselects supplier', () => {
    routeState.search = { redirect: '/owner/supply' }
    renderOnboarding()

    expect(screen.getByRole('radio', { name: 'Provide a Tool' }).getAttribute('aria-checked')).toBe('true')
  })

  it('R2e: sanitizes Clerk-style suggested workspace names on step 2', () => {
    routeState.readState.suggestedWorkspaceName = 'user_2abcClerkId'
    renderOnboarding()
    selectRole('Buy with an Agent')
    advanceToWorkspaceStep()

    expect(screen.getByRole('textbox', { name: 'Workspace name' })).toHaveProperty('value', 'Acme')
  })

  it('R3: empty workspace name keeps Create enabled and does not call complete', async () => {
    renderOnboarding()
    selectRole('Buy with an Agent')
    advanceToWorkspaceStep()

    const nameInput = screen.getByRole('textbox', { name: 'Workspace name' })
    fireEvent.change(nameInput, { target: { value: '   ' } })

    const finishButton = screen.getByRole('button', { name: 'Create workspace' })
    expect(finishButton).toHaveProperty('disabled', false)
    fireEvent.click(finishButton)
    expect(screen.getByText('Enter a workspace name.')).toBeTruthy()
    expect(nameInput.getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => {
      expect(routeState.completeMutation).not.toHaveBeenCalled()
    })
  })

  it('R3b: reload restores the selected role, workspace step, and workspace name from search', () => {
    routeState.search = {
      step: 2,
      roleIntent: 'supplier',
      workspaceName: 'Reloaded workspace',
    }
    renderOnboarding()

    expect(screen.getByText('Step 2 of 2')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Workspace name' })).toHaveProperty(
      'value',
      'Reloaded workspace',
    )
    expect(screen.getByText('Create workspace opens Provider Operations.')).toBeTruthy()
  })

  it('R3c: Create with an empty name does not call the completion mutation', async () => {
    renderOnboarding()
    selectRole('Buy with an Agent')
    advanceToWorkspaceStep()
    fireEvent.change(screen.getByRole('textbox', { name: 'Workspace name' }), {
      target: { value: '   ' },
    })
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(routeState.completeMutation).not.toHaveBeenCalled()
    })
    expect(screen.getByText('Enter a workspace name.')).toBeTruthy()
  })

  it('R4: valid submit calls complete with roleIntent, workspaceName, and correlationRef', async () => {
    routeState.completeMutation.mockResolvedValue({
      kind: 'completed',
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
    renderOnboarding()
    selectRole('Buy with an Agent')
    advanceToWorkspaceStep()

    fireEvent.change(screen.getByRole('textbox', { name: 'Workspace name' }), {
      target: { value: 'Acme Corp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(routeState.completeMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          roleIntent: 'buyer',
          workspaceName: 'Acme Corp',
          correlationRef: expect.stringMatching(/^onboarding:/),
        }),
      )
    })
  })

  it('R4b: successful submit shows buyer celebration toast before navigation', async () => {
    routeState.completeMutation.mockResolvedValue({
      kind: 'completed',
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
    renderOnboarding()
    selectRole('Buy with an Agent')
    advanceToWorkspaceStep()
    fireEvent.change(screen.getByRole('textbox', { name: 'Workspace name' }), {
      target: { value: 'Acme Corp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(toastState.success).toHaveBeenCalledWith(
        "Workspace created. Let's make your first Call",
        { description: 'Acme Corp' },
      )
      expect(routeState.navigate).toHaveBeenCalledWith({ to: '/owner' })
    })
  })

  it('R4c: mapped error toast states no charge on failure', async () => {
    routeState.completeMutation.mockRejectedValue(new Error('display_name_invalid'))
    renderOnboarding()
    selectRole('Buy with an Agent')
    advanceToWorkspaceStep()
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(toastState.error).toHaveBeenCalledWith(
        'Workspace name was not accepted',
        expect.objectContaining({
          description: expect.stringContaining('No charge was created'),
        }),
      )
    })
    expect(routeState.navigate).not.toHaveBeenCalledWith({ to: '/owner' })
  })

  it('R5: buyer lands on /owner and supplier lands on /owner/operations without redirect param', async () => {
    routeState.completeMutation.mockResolvedValue({
      kind: 'completed',
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
    renderOnboarding()
    selectRole('Buy with an Agent')
    advanceToWorkspaceStep()
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(routeState.navigate).toHaveBeenCalledWith({ to: '/owner' })
    })

    cleanup()
    routeState.navigate.mockReset()
    toastState.success.mockReset()
    routeState.completeMutation.mockResolvedValue({
      kind: 'completed',
      roleIntent: 'supplier',
      redirectPath: '/owner/operations',
    })
    renderOnboarding()
    selectRole('Provide a Tool')
    advanceToWorkspaceStep()
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(routeState.navigate).toHaveBeenCalledWith({ to: '/owner/operations' })
    })
  })

  it('R6: sanitized redirect search param wins after successful complete', async () => {
    routeState.search = { redirect: '/agent-access' }
    routeState.completeMutation.mockResolvedValue({
      kind: 'completed',
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
    renderOnboarding()
    advanceToWorkspaceStep()
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => {
      expect(routeState.navigate).toHaveBeenCalledWith({ to: '/agent-access' })
    })
  })

  it('R7: complete readState shows opening workspace chrome while navigating', async () => {
    routeState.readState = {
      phase: 'complete',
      accountRef: 'acc_test_onboarding',
      suggestedWorkspaceName: SUGGESTED_NAME,
      roleIntent: 'buyer',
      redirectPath: '/owner',
    }
    renderOnboarding()

    expect(screen.getByText('Opening your workspace...')).toBeTruthy()
    await waitFor(() => {
      expect(routeState.navigate).toHaveBeenCalledWith({ to: '/owner' })
    })
    expect(screen.queryByRole('heading', { name: 'Finish workspace' })).toBeNull()
  })
})
