/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const runtime = vi.hoisted(() => ({ detail: undefined as unknown }))

vi.mock('convex/react', () => ({ useQuery: () => runtime.detail }))

import { ToolPanel } from '@/components/ae/chat/tool-panel/ToolPanel'
import { ChatTranscript } from '@/components/ae/chat/ChatTranscript'
import type { ToolPanelProps } from '@/components/ae/chat/tool-panel/tool-panel.contracts'
import {
  PublicToolRegistrySchemaVersion,
  serializeToolDetailResult,
  type PublicToolAvailability,
  type PublicToolNavigationRelation,
  type ToolDetailWireResult,
} from '@/modules/capability-supply/public'
import { chatToolPanel } from '@/lib/public/chat-ia'
import { mockSearchTool } from '../../helpers/tool-search-rerank-fixtures'

const TOOL_REF = `operation:v1:${'a'.repeat(64)}`
const OTHER_TOOL_REF = `operation:v1:${'b'.repeat(64)}`
const CALL_NAVIGATION: readonly PublicToolNavigationRelation[] = [{
  relation: 'call',
  method: 'POST',
  actionId: 'capabilityTools.call',
  authentication: 'required',
}]

function foundDetail(args: Readonly<{
  toolRef?: string
  posture?: PublicToolAvailability['posture']
  reason?: PublicToolAvailability['reason']
  navigation?: readonly PublicToolNavigationRelation[]
}> = {}): ToolDetailWireResult {
  const posture = args.posture ?? 'routeable'
  const availability: PublicToolAvailability = {
    posture,
    ...(args.reason === undefined ? {} : { reason: args.reason }),
  }
  return serializeToolDetailResult({
    kind: 'found',
    schemaVersion: PublicToolRegistrySchemaVersion,
    tool: {
      ...mockSearchTool(args.toolRef ?? TOOL_REF, 'lookup', 'Lookup', 'Lookup a value'),
      availability,
      navigation: [...(args.navigation ?? [])],
    },
  })
}

function unavailableDetail(): ToolDetailWireResult {
  return serializeToolDetailResult({
    kind: 'unavailable',
    schemaVersion: PublicToolRegistrySchemaVersion,
    toolRef: TOOL_REF,
    reason: 'temporarily_unavailable',
    navigation: [],
  })
}

function notFoundDetail(): ToolDetailWireResult {
  return serializeToolDetailResult({
    kind: 'not_found',
    schemaVersion: PublicToolRegistrySchemaVersion,
    toolRef: TOOL_REF,
    navigation: [],
  })
}

function invalidDetail(): ToolDetailWireResult {
  const result = foundDetail({ navigation: CALL_NAVIGATION })
  if (result.kind !== 'found') throw new Error('expected_found_tool_detail')
  return { ...result, tool: { ...result.tool, listingTier: 'listed' } }
}

function makeProps(overrides: Partial<ToolPanelProps> = {}): ToolPanelProps {
  return {
    option: {
      id: TOOL_REF,
      name: 'Lookup',
      href: `/tools/${TOOL_REF}`,
      price: 'A$0.001',
      readiness: 'ready',
      selectable: true,
    },
    message: 'Look this up',
    open: true,
    runMode: 'run',
    generating: false,
    focusOnOpen: false,
    onRun: vi.fn(async () => ({ kind: 'submitted' as const })),
    onAddCredit: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  runtime.detail = undefined
})

it('places active input review after the answer and before Tool evidence without submitting a Call', () => {
  runtime.detail = undefined
  const onRunTool = vi.fn(async () => ({ kind: 'submitted' as const }))
  render(<ChatTranscript messages={[{ id: 'answer', role: 'assistant', parts: [
    { type: 'tool-registry_tools_search', state: 'output-available', output: {
      kind: 'match', results: [{ toolRef: TOOL_REF, title: 'Lookup', source: 'current',
        access: 'ae_callable', readiness: 'ready' }],
    } },
    { type: 'text', text: '**Lookup supports your request.**' },
  ] }]} onRunTool={onRunTool} />)
  fireEvent.click(screen.getByRole('button', { name: 'Review inputs' }))
  const answer = screen.getByRole('region', { name: 'Answer' })
  const panel = screen.getByRole('region', { name: 'Review Lookup' })
  const options = screen.getByRole('region', { name: 'Options' })
  expect(answer.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  expect(panel.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  expect(screen.getAllByRole('region', { name: 'Review Lookup' })).toHaveLength(1)
  expect(onRunTool).not.toHaveBeenCalled()
})

it('keeps loading detail in the loading view without Run or credit callbacks', () => {
  const props = makeProps()
  render(<ToolPanel {...props} />)

  expect(screen.getByRole('status', { name: chatToolPanel.loading })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Run/u })).toBeNull()
  expect(props.onRun).not.toHaveBeenCalled()
  expect(props.onAddCredit).not.toHaveBeenCalled()
})

it.each(['run', 'add_credit'] as const)(
  'allows %s after a matching inspection-required detail, on explicit submission only',
  async (runMode) => {
    runtime.detail = foundDetail({ posture: 'setup_required', reason: 'inspection_required' })
    const onRun = vi.fn(async () => ({ kind: 'submitted' as const }))
    const onAddCredit = vi.fn()
    render(<ToolPanel {...makeProps({ runMode, onRun, onAddCredit })} />)

    await waitFor(() => expect(screen.queryByRole('status', { name: chatToolPanel.loading })).toBeNull())
    expect(screen.getByRole('group', { name: 'Tool inputs' })).toBeVisible()
    const run = screen.getByRole('button', { name: /Run/u })
    expect(run).toBeEnabled()
    expect(onRun).not.toHaveBeenCalled()
    expect(onAddCredit).not.toHaveBeenCalled()

    fireEvent.click(run)
    if (runMode === 'run') await screen.findByText(chatToolPanel.submitted)

    const intent = { toolRef: TOOL_REF, title: 'Lookup', input: {} }
    if (runMode === 'run') {
      expect(onRun).toHaveBeenCalledExactlyOnceWith(intent)
      expect(onAddCredit).not.toHaveBeenCalled()
    } else {
      expect(onAddCredit).toHaveBeenCalledExactlyOnceWith(intent)
      expect(onRun).not.toHaveBeenCalled()
    }
  },
)

const refusedDetails: readonly (readonly [string, () => ToolDetailWireResult])[] = [
  ['setup required for a non-inspection reason', () => foundDetail({ posture: 'setup_required', reason: 'setup_required' })],
  ['unavailable posture', () => foundDetail({ posture: 'unavailable', reason: 'temporarily_unavailable' })],
  ['routeable posture without call navigation', () => foundDetail({ posture: 'routeable' })],
  ['unavailable result', unavailableDetail],
  ['not-found result', notFoundDetail],
  ['invalid detail', invalidDetail],
  ['detail for a different Tool', () => foundDetail({ toolRef: OTHER_TOOL_REF, navigation: CALL_NAVIGATION })],
]

for (const runMode of ['run', 'add_credit'] as const) {
  for (const [description, makeDetail] of refusedDetails) {
    it(`refuses ${runMode} when current detail is ${description}`, () => {
      runtime.detail = makeDetail()
      const props = makeProps({ runMode })
      render(<ToolPanel {...props} />)

      expect(screen.getByText(chatToolPanel.unavailable)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Run/u })).toBeNull()
      expect(props.onRun).not.toHaveBeenCalled()
      expect(props.onAddCredit).not.toHaveBeenCalled()
    })
  }
}

it('removes submission when fresh detail changes from allowed to blocked despite stale ready card state', async () => {
  runtime.detail = foundDetail({ navigation: CALL_NAVIGATION })
  const props = makeProps()
  const { rerender } = render(<ToolPanel {...props} />)
  expect(screen.getByRole('button', { name: /Run/u })).toBeEnabled()
  await waitFor(() => expect(screen.queryByRole('status', { name: chatToolPanel.loading })).toBeNull())

  runtime.detail = foundDetail({ posture: 'routeable' })
  rerender(<ToolPanel {...props} />)

  expect(props.option.readiness).toBe('ready')
  expect(screen.getByText(chatToolPanel.unavailable)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Run/u })).toBeNull()
  expect(props.onRun).not.toHaveBeenCalled()
  expect(props.onAddCredit).not.toHaveBeenCalled()
})

it('preserves an in-flight submission when current detail becomes blocked without retrying it', async () => {
  let finish: (() => void) | undefined
  const onRun = vi.fn(() => new Promise<{ kind: 'submitted' }>(resolve => {
    finish = () => resolve({ kind: 'submitted' })
  }))
  runtime.detail = foundDetail({ navigation: CALL_NAVIGATION })
  const props = makeProps({ onRun })
  const { rerender } = render(<ToolPanel {...props} />)
  await waitFor(() => expect(screen.queryByRole('status', { name: chatToolPanel.loading })).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: /Run/u }))
  expect(onRun).toHaveBeenCalledOnce()

  runtime.detail = foundDetail({ posture: 'setup_required', reason: 'setup_required' })
  rerender(<ToolPanel {...props} />)
  expect(screen.getByText(chatToolPanel.unavailable)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Run/u })).toBeNull()

  await act(async () => { finish?.() })
  runtime.detail = foundDetail({ navigation: CALL_NAVIGATION })
  rerender(<ToolPanel {...props} />)
  expect(await screen.findByText(chatToolPanel.submitted)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: chatToolPanel.runAgain })).toBeInTheDocument()
  expect(onRun).toHaveBeenCalledExactlyOnceWith({ toolRef: TOOL_REF, title: 'Lookup', input: {} })
  expect(props.onAddCredit).not.toHaveBeenCalled()
})
