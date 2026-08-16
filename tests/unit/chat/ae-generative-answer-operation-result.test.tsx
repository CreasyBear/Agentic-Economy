/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import {
  artifactsToMessageParts,
  projectAnswerOperationResult,
  type AnswerArtifact,
  type AnswerOperationOutcome,
  type AnswerOperationPresentation,
} from '@/modules/answer/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const operationRef = `operation:v1:${'a'.repeat(64)}`

const catPresentation: AnswerOperationPresentation = {
  descriptorDigest: `sha256:${'b'.repeat(64)}`,
  operationLabel: 'Random cat image batch',
  sourceLabel: 'Mockster',
  outputSchemaDigest: `sha256:${'c'.repeat(64)}`,
  outputAnnotations: [{
    pointer: '/0/url',
    label: 'Cat image link',
    role: 'completion_evidence',
    semanticIdentity: 'https-link',
  }],
  actor: 'ae_runtime',
  observedAt: Date.UTC(2026, 7, 13, 12),
}

describe('AeGenerativeAnswer operation result presentation', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders an annotated Mockster HTTPS value as a safe link without loading remote media', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const url = 'https://images.example.test/cat.jpg'
    const { container } = renderAnswer(outcome([{ name: 'cats_1.jpg', url }]))

    const link = screen.getByRole('link', { name: 'Cat image link' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(container.querySelector('img')).toBeNull()
    expect(link.className).toContain('min-h-6')
    expect(container.querySelector('video, iframe, object, embed')).toBeNull()
    expect(screen.getByText('Mockster')).toBeTruthy()
    expect(screen.getByText(/Run by AE runtime/)).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()

    const result = screen.getByRole('region', { name: 'Result' })
    const source = screen.getByText('Mockster').parentElement
    const details = screen.getByText('Technical details').closest('details')
    expect(result.compareDocumentPosition(source!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(source!.compareDocumentPosition(details!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(details?.querySelector('summary')?.className).toContain('min-h-11')
    expect(details?.open).toBe(false)
  })

  it('renders scalar and object values generically instead of leading with raw JSON', () => {
    const scalar = renderAnswer(outcome(42, {
      ...catPresentation,
      operationLabel: 'Scalar result',
      outputAnnotations: [{ pointer: '', label: 'Answer', role: 'result' }],
    }))
    expect(screen.getByRole('region', { name: 'Result' }).textContent).toContain('42')
    expect(screen.getByText('Raw bounded JSON').closest('details')?.open).toBe(false)

    scalar.unmount()
    renderAnswer(outcome({ status: 'ready', count: 2 }, {
      ...catPresentation,
      operationLabel: 'Object result',
      outputAnnotations: [{ pointer: '/status', label: 'Current status', role: 'result' }],
    }))
    const result = screen.getByRole('region', { name: 'Result' })
    expect(result.textContent).toContain('Current status')
    expect(result.textContent).toContain('ready')
    expect(result.textContent).toContain('Count')
  })

  it('keeps unknown URLs, HTML, and bidi controls escaped text', () => {
    const unsafe = 'http://images.example.test/cat.jpg'
    const html = '<img src="https://tracker.example.test/pixel" onerror="alert(1)">'
    const { container } = renderAnswer(outcome({ unsafe, html, note: `safe\u202etext` }, {
      ...catPresentation,
      outputAnnotations: [{
        pointer: '/unsafe',
        label: 'Untrusted link',
        role: 'result',
        semanticIdentity: 'https-link',
      }],
    }))

    expect(screen.queryByRole('link', { name: unsafe })).toBeNull()
    expect(container.querySelector('img, script')).toBeNull()
    expect(screen.getByRole('region', { name: 'Result' }).textContent).toContain(html)
    expect(screen.getByRole('region', { name: 'Result' }).textContent).not.toContain('\u202e')
  })

  it('does not create a competing terminal announcement inside each answer', () => {
    const artifacts: readonly AnswerArtifact[] = [{ kind: 'operation-outcome', outcome: outcome({ ok: true }) }]
    const view = renderWithRouter(
      <AeGenerativeAnswer artifacts={artifacts} query="status" phase="streaming" busy />,
    )
    expect(screen.queryByRole('status')).toBeNull()

    view.rerender(withRouter(
      <AeGenerativeAnswer artifacts={artifacts} query="status" phase="complete" />,
    ))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('projects identical stream and replay parts from frozen outcome metadata', () => {
    const frozenOutcome = outcome({ ip: '203.0.113.7' }, {
      ...catPresentation,
      operationLabel: 'Get AE runtime public IP',
      sourceLabel: 'ipify',
      outputAnnotations: [{ pointer: '/ip', label: 'AE runtime public IP', role: 'completion_evidence' }],
    })
    const artifacts: readonly AnswerArtifact[] = [{ kind: 'operation-outcome', outcome: frozenOutcome }]

    const streamParts = artifactsToMessageParts(artifacts, 'data_answer')
    const replayParts = artifactsToMessageParts(structuredClone(artifacts), 'data_answer')
    expect(replayParts).toEqual(streamParts)
    expect(projectAnswerOperationResult(frozenOutcome).presentation).toEqual(frozenOutcome.presentation)
    expect(JSON.stringify(replayParts)).toContain('AE runtime public IP')
    expect(JSON.stringify(replayParts)).not.toContain('your IP')
  })
})

function outcome(
  output: Extract<AnswerOperationOutcome['result'], { kind: 'ok' }>['output'],
  presentation: AnswerOperationPresentation = catPresentation,
): AnswerOperationOutcome {
  const result = {
    kind: 'ok' as const,
    operationRef,
    capabilityId: 'fixture.operation',
    name: presentation.operationLabel,
    output,
    evidenceHash: `sha256:${'d'.repeat(64)}`,
  }
  return {
    toolId: 'operation.execute',
    operationRef,
    resultDigest: canonicalDigest(result).toString(),
    toolCallDigest: `sha256:${'e'.repeat(64)}`,
    presentation,
    result,
  }
}

function renderAnswer(operationOutcome: AnswerOperationOutcome) {
  return renderWithRouter(
    <AeGenerativeAnswer
      artifacts={[{ kind: 'operation-outcome', outcome: operationOutcome }]}
      query="show the result"
      layoutProfile="data_answer"
      phase="complete"
    />,
  )
}

function withRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const operationRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/operations/$operationRef',
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([operationRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return <RouterContextProvider router={router}>{ui}</RouterContextProvider>
}

function renderWithRouter(ui: ReactElement) {
  return render(withRouter(ui))
}
