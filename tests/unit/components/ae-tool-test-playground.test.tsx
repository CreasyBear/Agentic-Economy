/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeToolTestPlayground } from '@/components/ae/supply/AeToolTestPlayground'

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

  it('renders test playground with prefilled JSON parameters and Send Test Request button', () => {
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
    expect(screen.getByText(/does not open a commercial call or debit prepaid credit/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /send test request/i })).toBeTruthy()
  })

  it('dispatches probe request, tracks latency, and displays formatted response', async () => {
    const onSendTestRequest = vi.fn(async (_payload: unknown) => {
      return {
        status: 200,
        latencyMs: 142,
        data: { rate: 0.1, calculatedTax: 10.5 },
      }
    })

    render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={onSendTestRequest}
      />,
    )

    const sendButton = screen.getByRole('button', { name: /send test request/i })
    fireEvent.click(sendButton)

    await waitFor(() => expect(onSendTestRequest).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/200 OK/i)).toBeTruthy()
    expect(screen.getAllByText(/142ms/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/calculatedTax/i)).toBeTruthy()
  })

  it('handles simulated error responses gracefully', async () => {
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
        onSendTestRequest={onSendTestRequest}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send test request/i }))

    await waitFor(() => expect(onSendTestRequest).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/502 Error/i)).toBeTruthy()
    expect(screen.getAllByText(/350ms/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Bad Gateway: Provider endpoint timed out/i)).toBeTruthy()
  })

  it('blocks send when JSON payload fails schema validation', async () => {
    const onSendTestRequest = vi.fn()

    render(
      <AeToolTestPlayground
        toolName="Australian Tax Calculator"
        inputSchema={sampleSchema}
        onSendTestRequest={onSendTestRequest}
      />,
    )

    fireEvent.change(screen.getByLabelText(/input parameters \(json\)/i), { target: { value: '{"includeTax": true}' } })
    fireEvent.click(screen.getByRole('button', { name: /send test request/i }))

    expect(await screen.findByText(/does not match the tool schema/i)).toBeTruthy()
    expect(onSendTestRequest).not.toHaveBeenCalled()
  })
})
