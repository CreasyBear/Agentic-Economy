/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { HomeResumeToolSection } from '@/components/ae/agent-access/home/components/HomeResumeToolSection'
import type { HomeResumeToolSectionProps } from '@/components/ae/agent-access/home/agent-access-home.contracts'
import type { AgentDirectoryItem, AgentFirstUseState } from '@/modules/agent-access/public'
import type { AgentActivityView, AgentLiveCallView } from '@/modules/agent-access/agent-operator-view-model'

afterEach(cleanup)

const CALL_REF = 'call:original-first-use'
const TOOL_REF = `operation:v1:${'a'.repeat(64)}`
const RECEIPT_REF = 'receipt:tool-result-123'
const CALL_HREF = `/calls/${encodeURIComponent(CALL_REF)}`
const TOOL_HREF = `/tools/${encodeURIComponent(TOOL_REF)}`

const agent: AgentDirectoryItem = {
  principalRef: `prn_${'1'.repeat(32)}`,
  principalRevision: 3,
  displayName: 'Research Agent',
  applicationRef: 'codex',
  environment: 'production',
  status: 'connected',
  spendingPolicy: { kind: 'unset' },
  currentCredentialGeneration: 1,
  connectionCount: 1,
  connectorDisplayNames: ['Codex'],
  authorityMode: 'approval_required',
}

type CallAccess = Extract<AgentFirstUseState, { kind: 'running' | 'awaiting_authority' | 'recording_result' }>['access']

const approvedAccess: CallAccess = { kind: 'authorized', authenticated: false }
const authenticatedAccess: CallAccess = { kind: 'authenticated', authenticated: true }
const connectionRequiredAccess: CallAccess = { kind: 'connection_required', authenticated: false }
const unavailableAccess: CallAccess = { kind: 'unavailable', authenticated: false }

const callIdentity = {
  callRef: CALL_REF,
  credentialRef: 'credential:current-agent',
  toolRef: TOOL_REF,
  createdAt: 1_790_000_000_000,
  updatedAt: 1_790_000_000_100,
} satisfies Omit<AgentLiveCallView, 'phase'>

const deliveredCall: AgentActivityView & { receiptRef: string } = {
  ...callIdentity,
  toolLabel: 'Perth weather summary',
  providerRef: 'provider:weather',
  state: 'completed',
  deliveryState: 'delivered',
  paymentState: 'settled',
  receiptRef: RECEIPT_REF,
}

function runningState(phase: 'queued' | 'running', access: CallAccess = approvedAccess): AgentFirstUseState {
  return {
    kind: 'running',
    agent,
    call: { ...callIdentity, phase },
    access,
  }
}

function awaitingAuthorityState(): AgentFirstUseState {
  return {
    kind: 'awaiting_authority',
    agent,
    call: { ...callIdentity, phase: 'awaiting_authority' },
    access: approvedAccess,
  }
}

function recordingResultState(): AgentFirstUseState {
  return {
    kind: 'recording_result',
    agent,
    call: { ...callIdentity, phase: 'finished' },
    access: approvedAccess,
  }
}

function recoverState(): AgentFirstUseState {
  return {
    kind: 'recover',
    agent,
    call: {
      callRef: CALL_REF,
      credentialRef: callIdentity.credentialRef,
      toolRef: TOOL_REF,
      createdAt: callIdentity.createdAt,
    },
    access: approvedAccess,
  }
}

function deliveredState(access: CallAccess = authenticatedAccess): AgentFirstUseState {
  return { kind: 'delivered', agent, call: deliveredCall, access }
}

type SectionOverrides = Partial<Pick<HomeResumeToolSectionProps,
  'liveUpdates' | 'resumeTool' | 'onConnect' | 'onCheck' | 'checking'>>

function createTestRouter() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/agent-access' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/calls/$callRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/tools/$toolRef' }),
  ])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/agent-access'] }),
  })
}

function sectionProps(firstUse: AgentFirstUseState, overrides: SectionOverrides): HomeResumeToolSectionProps {
  return {
    firstUse,
    liveUpdates: overrides.liveUpdates ?? 'current',
    resumeTool: overrides.resumeTool ?? TOOL_REF,
    onConnect: overrides.onConnect ?? vi.fn(),
    onCheck: overrides.onCheck ?? vi.fn(),
    checking: overrides.checking ?? false,
  }
}

function renderSection(firstUse: AgentFirstUseState, overrides: SectionOverrides = {}) {
  const router = createTestRouter()
  const view = render(
    <RouterContextProvider router={router}>
      <HomeResumeToolSection {...sectionProps(firstUse, overrides)} />
    </RouterContextProvider>,
  )

  return {
    ...view,
    rerenderSection: (nextFirstUse: AgentFirstUseState, nextOverrides: SectionOverrides = {}) => view.rerender(
      <RouterContextProvider router={router}>
        <HomeResumeToolSection {...sectionProps(nextFirstUse, nextOverrides)} />
      </RouterContextProvider>,
    ),
  }
}

function statusAnnouncements() {
  return screen.getAllByRole('status').map(status => status.textContent ?? '').join(' ')
}

describe('HomeResumeToolSection observed Call frame', () => {
  it.each([
    ['queued', 'Queued'],
    ['running', 'Running'],
  ] as const)('shows the existing %s Call state and original destination', (phase, label) => {
    renderSection(runningState(phase))

    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByRole('heading', {
      name: phase === 'queued' ? 'Your Call is queued' : 'The Tool is running',
    })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View live Call' })).toHaveAttribute('href', CALL_HREF)
    expect(screen.getByText(CALL_REF)).toBeInTheDocument()
  })

  it('keeps an awaiting-authority Call in a decision state without claiming completion', () => {
    renderSection(awaitingAuthorityState())

    expect(screen.getByRole('heading', { name: 'Your Agent needs a decision' })).toBeInTheDocument()
    expect(screen.getByText(/requested permission for this Call/u)).toBeInTheDocument()
    expect(screen.getByText('Waiting for your decision')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Check existing Call' })).toHaveAttribute('href', CALL_HREF)
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
    expect(screen.queryByText(RECEIPT_REF)).not.toBeInTheDocument()
  })

  it('shows a finished but unrecorded Call as pending delivery and receipt', () => {
    renderSection(recordingResultState())

    expect(screen.getByRole('heading', { name: 'Recording the Tool result' })).toBeInTheDocument()
    expect(screen.getByText(/Waiting for its recorded delivery and receipt/u)).toBeInTheDocument()
    expect(screen.getByText('Recording delivery and receipt')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Check existing Call' })).toHaveAttribute('href', CALL_HREF)
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
    expect(screen.queryByText(RECEIPT_REF)).not.toBeInTheDocument()
  })

  it('shows a delivered Call only with its receipt fact and links to that Call', () => {
    renderSection(deliveredState())

    expect(screen.getByRole('heading', { name: 'A Tool result is recorded' })).toBeInTheDocument()
    expect(screen.getByText('Delivered with a receipt')).toBeInTheDocument()
    expect(screen.getByText('Receipt reference')).toBeInTheDocument()
    expect(screen.getByText(RECEIPT_REF)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Tool result and receipt' })).toHaveAttribute('href', CALL_HREF)
    expect(screen.getByRole('link', { name: 'Return to selected Tool' })).toHaveAttribute('href', TOOL_HREF)
  })

  it('recovers the same Call and offers no repurchase action', () => {
    renderSection(recoverState())

    expect(screen.getByRole('heading', { name: 'Resolve the existing Call' })).toBeInTheDocument()
    expect(screen.getByText(/delivery and payment status before making another purchase/u)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Check existing Call' })).toHaveAttribute('href', CALL_HREF)
    expect(screen.getByRole('link', { name: 'Return to selected Tool' })).toHaveAttribute('href', TOOL_HREF)
    expect(screen.queryByRole('button', { name: /buy|purchase|repurchase|retry/u })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /buy|purchase|repurchase|retry/u })).not.toBeInTheDocument()
  })

  it('announces delayed delivery as last confirmed and keeps the original Call while access is unconfirmed', () => {
    renderSection(deliveredState(unavailableAccess), { liveUpdates: 'delayed' })

    expect(statusAnnouncements()).toMatch(/Last confirmed service state: A Tool result is recorded/u)
    expect(screen.getByText(/Current access: unconfirmed/u)).toBeInTheDocument()
    expect(screen.getByText(RECEIPT_REF)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Tool result and receipt' })).toHaveAttribute('href', CALL_HREF)
    expect(screen.queryByRole('link', { name: 'Return to selected Tool' })).not.toBeInTheDocument()
  })

  it('keeps Call checks and connection controls available while checking current access', () => {
    const onCheck = vi.fn()
    const onConnect = vi.fn()
    const currentState = runningState('running', connectionRequiredAccess)
    const view = renderSection(currentState, { checking: true, onCheck, onConnect })

    const pendingCheck = screen.getByRole('button', { name: 'Checking…' })
    expect(pendingCheck).toBeDisabled()
    fireEvent.click(pendingCheck)
    expect(onCheck).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Connect an Agent' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Connect an Agent' }))
    expect(onConnect).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'View live Call' })).toHaveAttribute('href', CALL_HREF)
    expect(screen.queryByRole('link', { name: 'Return to selected Tool' })).not.toBeInTheDocument()

    view.rerenderSection(currentState, { checking: false, onCheck, onConnect })
    fireEvent.click(screen.getByRole('button', { name: 'Check first-use progress' }))
    expect(onCheck).toHaveBeenCalledOnce()
  })

  it('keeps the first-use Stepper and instruction before any Call exists', () => {
    const firstUse: AgentFirstUseState = { kind: 'authorized', agent }
    renderSection(firstUse)

    expect(screen.getByRole('group', { name: 'First Tool use' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy instruction for your Agent' })).toBeInTheDocument()
    expect(screen.getByText(/No authenticated request from the current credential has been observed yet/u)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Call/u })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'A Tool result is recorded' })).not.toBeInTheDocument()
  })
})
