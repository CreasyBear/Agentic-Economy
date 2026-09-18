/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const SUGGESTED_NAME = 'Canonical account'

const routeState = vi.hoisted(() => ({
  Onboarding: null as ComponentType | null,
  search: {} as { redirect?: string },
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

import '@/routes/onboarding'

function renderOnboarding() {
  const Component = routeState.Onboarding
  if (Component === null) throw new Error('Onboarding route was not captured.')
  return render(<Component />)
}

function selectRole(label: 'Buyer / Agent Operator' | 'Supplier / Tool Provider') {
  fireEvent.click(screen.getByRole('radio', { name: label }))
}

afterEach(() => {
  cleanup()
  routeState.search = {}
  routeState.navigate.mockReset()
  routeState.completeMutation.mockReset()
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
  it('R1: incomplete state renders role intent step with Continue disabled', () => {
    renderOnboarding()

    expect(screen.getByRole('heading', { name: 'Set up your workspace' })).toBeTruthy()
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Buyer / Agent Operator' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Supplier / Tool Provider' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', true)
  })

  it('R2: selecting a role enables Continue and opens the workspace name step', () => {
    renderOnboarding()

    selectRole('Buyer / Agent Operator')
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', false)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { name: 'Workspace name' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Workspace name' })).toHaveProperty('value', SUGGESTED_NAME)
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  })

  it('R3: empty workspace name blocks finish and does not call complete', async () => {
    renderOnboarding()
    selectRole('Buyer / Agent Operator')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    const nameInput = screen.getByRole('textbox', { name: 'Workspace name' })
    fireEvent.change(nameInput, { target: { value: '   ' } })

    const finishButton = screen.getByRole('button', { name: 'Finish setup' })
    expect(finishButton).toHaveProperty('disabled', true)
    fireEvent.click(finishButton)
    await waitFor(() => {
      expect(routeState.completeMutation).not.toHaveBeenCalled()
    })
  })

  it('R4: valid submit calls complete with roleIntent, workspaceName, and correlationRef', async () => {
    routeState.completeMutation.mockResolvedValue({
      kind: 'completed',
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
    renderOnboarding()
    selectRole('Buyer / Agent Operator')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Workspace name' }), {
      target: { value: 'Acme Corp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))

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

  it('R5: buyer lands on /owner and supplier lands on /owner/operations without redirect param', async () => {
    routeState.completeMutation.mockResolvedValue({
      kind: 'completed',
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
    renderOnboarding()
    selectRole('Buyer / Agent Operator')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))

    await waitFor(() => {
      expect(routeState.navigate).toHaveBeenCalledWith({ to: '/owner' })
    })

    cleanup()
    routeState.navigate.mockReset()
    routeState.completeMutation.mockResolvedValue({
      kind: 'completed',
      roleIntent: 'supplier',
      redirectPath: '/owner/operations',
    })
    renderOnboarding()
    selectRole('Supplier / Tool Provider')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))

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
    selectRole('Buyer / Agent Operator')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))

    await waitFor(() => {
      expect(routeState.navigate).toHaveBeenCalledWith({ to: '/agent-access' })
    })
  })

  it('R7: complete readState navigates immediately without rendering the form', async () => {
    routeState.readState = {
      phase: 'complete',
      accountRef: 'acc_test_onboarding',
      suggestedWorkspaceName: SUGGESTED_NAME,
      roleIntent: 'buyer',
      redirectPath: '/owner',
    }
    renderOnboarding()

    await waitFor(() => {
      expect(routeState.navigate).toHaveBeenCalledWith({ to: '/owner' })
    })
    expect(screen.queryByRole('heading', { name: 'Set up your workspace' })).toBeNull()
  })
})
