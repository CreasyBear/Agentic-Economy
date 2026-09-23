/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AeToolTestPlayground,
  TACTILE,
} from '@/components/ae/supply/tool-test-playground/AeToolTestPlayground'

const toastSuccess = vi.fn()
vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

const clipboardState = vi.hoisted(() => ({
  isCopied: false,
  copy: vi.fn(),
}))

vi.mock('@/hooks/use-clipboard-copy', () => ({
  useClipboardCopy: () => ({
    status: clipboardState.isCopied ? 'copied' : 'idle',
    isCopied: clipboardState.isCopied,
    copy: clipboardState.copy,
  }),
}))

afterEach(cleanup)

describe('AeToolTestPlayground', () => {
  const sampleSchema = {
    type: 'object',
    properties: {
      postcode: { type: 'string', title: 'Postcode', default: '2000' },
      includeTax: { type: 'boolean', title: 'Include Tax', default: true },
    },
    required: ['postcode'],
  }

  const richExampleSchema = {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' },
      mode: { type: 'string', enum: ['fast', 'slow'] },
      note: { type: 'string', examples: ['sample note'] },
      count: { type: 'integer', minimum: 3 },
    },
    required: ['email'],
  }

  beforeEach(() => {
    toastSuccess.mockClear()
    clipboardState.copy.mockClear()
    clipboardState.isCopied = false
  })

  it('renders heading, zero-cost copy, and Simulation Mode banner', () => {
    render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: /interactive test playground/i })).toBeTruthy()
    expect(screen.getByText(/zero-cost sandbox probe/i)).toBeTruthy()
    expect(screen.getByText(/never creates quotes, charges, or buyer balance movements/i)).toBeTruthy()
    expect(screen.getByText(/Simulation Mode: Zero credit deducted/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /send test invocation/i })).toBeTruthy()
  })

  it('reserves diagnostic and response pane heights before send', () => {
    const { container } = render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={vi.fn()}
      />,
    )

    expect(container.querySelector('.min-h-\\[2\\.5rem\\]')).toBeTruthy()
    expect(container.querySelector('.min-h-\\[12rem\\]')).toBeTruthy()
  })

  it('action buttons include tactile interaction classes', () => {
    render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={vi.fn()}
      />,
    )

    const loadButton = screen.getByRole('button', { name: /load example arguments/i })
    const resetButton = screen.getByRole('button', { name: /reset to defaults/i })
    const sendButton = screen.getByRole('button', { name: /send test invocation/i })

    expect(loadButton.className).toContain('active:scale-[0.98]')
    expect(resetButton.className).toContain('active:scale-[0.98]')
    expect(sendButton.className).toContain('active:scale-[0.98]')
    expect(TACTILE).toContain('motion-reduce:transition-none')
  })

  it('dispatches probe request and shows 200 OK success badge with latency', async () => {
    const onSendTestRequest = vi.fn(async (_payload: unknown) => {
      return {
        status: 200,
        latencyMs: 142,
        data: { rate: 0.1, calculatedTax: 10.5 },
      }
    })

    const { container } = render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={onSendTestRequest}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send test invocation/i }))

    await waitFor(() => expect(onSendTestRequest).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/200 OK/i)).toBeTruthy()
    const latencyBadge = container.querySelector('.font-mono.tabular-nums')
    expect(latencyBadge?.textContent).toMatch(/⚡\s*142ms/)
    expect(screen.getByText(/calculatedTax/i)).toBeTruthy()
    expect(container.querySelector('.min-h-\\[12rem\\]')).toBeTruthy()
    expect(container.querySelector('.min-h-\\[2\\.5rem\\]')).toBeTruthy()
  })

  it('shows 502 Bad Gateway badge and probe failure Rule 4 triplet', async () => {
    const onSendTestRequest = vi.fn(async () => {
      return {
        status: 502,
        latencyMs: 350,
        error: 'Bad Gateway: Provider endpoint timed out',
      }
    })

    render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={onSendTestRequest}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send test invocation/i }))

    await waitFor(() => expect(onSendTestRequest).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/502 Bad Gateway/i)).toBeTruthy()
    expect(screen.getByText(/Provider endpoint simulation failed/i)).toBeTruthy()
    expect(screen.getByText(/A\$0\.00 affected — sandbox probe only/i)).toBeTruthy()
    expect(screen.getByText(/Bad Gateway: Provider endpoint timed out/i)).toBeTruthy()
  })

  it('blocks send on schema mismatch with Rule 4 triplet', async () => {
    const onSendTestRequest = vi.fn()

    render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={onSendTestRequest}
      />,
    )

    fireEvent.change(screen.getByLabelText(/input parameters \(json\)/i), {
      target: { value: '{"includeTax": true}' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send test invocation/i }))

    expect(await screen.findByText(/Payload does not match schema/i)).toBeTruthy()
    expect(screen.getByText(/A\$0\.00 affected — dry run probe blocked/i)).toBeTruthy()
    expect(
      screen.getByText(/Adjust arguments to satisfy required schema properties/i),
    ).toBeTruthy()
    expect(onSendTestRequest).not.toHaveBeenCalled()
  })

  it('blocks send on invalid JSON with syntax Rule 4 triplet', async () => {
    const onSendTestRequest = vi.fn()

    render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={onSendTestRequest}
      />,
    )

    fireEvent.change(screen.getByLabelText(/input parameters \(json\)/i), {
      target: { value: '{not-json' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send test invocation/i }))

    expect(await screen.findByText(/Invalid JSON format/i)).toBeTruthy()
    expect(screen.getByText(/A\$0\.00 affected — dry run probe blocked/i)).toBeTruthy()
    expect(screen.getByText(/Check syntax and ensure valid JSON before sending/i)).toBeTruthy()
    expect(onSendTestRequest).not.toHaveBeenCalled()
  })

  it('load example arguments fills schema-derived values and toasts success', () => {
    render(
      <AeToolTestPlayground
        toolName="Rich Examples"
        inputSchema={richExampleSchema}
        onSendTestRequest={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /load example arguments/i }))

    expect(toastSuccess).toHaveBeenCalledWith('Example arguments loaded')
    const textarea = screen.getByLabelText(/input parameters \(json\)/i) as HTMLTextAreaElement
    const parsed = JSON.parse(textarea.value) as Record<string, unknown>
    expect(parsed.email).toBe('operator@example.com')
    expect(parsed.mode).toBe('fast')
    expect(parsed.note).toBe('sample note')
    expect(parsed.count).toBe(3)
  })

  it('reset to defaults restores default payload from schema', () => {
    render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={vi.fn()}
      />,
    )

    const textarea = screen.getByLabelText(/input parameters \(json\)/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '{"postcode":"3000","includeTax":false}' } })
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }))

    const parsed = JSON.parse(textarea.value) as Record<string, unknown>
    expect(parsed).toEqual({ postcode: '2000', includeTax: true })
  })

  it('shows probe failure Rule 4 triplet when the request throws', async () => {
    const onSendTestRequest = vi.fn(async () => {
      throw new Error('Network unreachable')
    })

    render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={onSendTestRequest}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send test invocation/i }))

    await waitFor(() => expect(onSendTestRequest).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/Provider endpoint simulation failed/i)).toBeTruthy()
    expect(screen.getByText(/A\$0\.00 affected — sandbox probe only/i)).toBeTruthy()
    expect(screen.getByText(/Network unreachable/i)).toBeTruthy()
  })

  it('copy response invokes clipboard copy and shows Copied! feedback', async () => {
    const onSendTestRequest = vi.fn(async () => ({
      status: 200,
      latencyMs: 50,
      data: { ok: true },
    }))

    const view = render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={onSendTestRequest}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send test invocation/i }))
    await waitFor(() => expect(onSendTestRequest).toHaveBeenCalledTimes(1))

    const copyButton = await screen.findByRole('button', { name: /copy response/i })
    fireEvent.click(copyButton)
    expect(clipboardState.copy).toHaveBeenCalledTimes(1)

    clipboardState.isCopied = true
    view.rerender(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={onSendTestRequest}
      />,
    )

    expect(await screen.findByRole('button', { name: /response copied/i })).toBeTruthy()
    expect(screen.getByText(/Copied!/i)).toBeTruthy()
  })
})
