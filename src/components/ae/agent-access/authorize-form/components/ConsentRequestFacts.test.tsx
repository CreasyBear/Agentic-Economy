// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../../../../../tests/setup/jsdom-platform'

import type { ConsentRequestFactsProps } from '../authorize-form.contracts'
import { ConsentRequestFacts } from './ConsentRequestFacts'

const props: ConsentRequestFactsProps = {
  clientName: 'Customer app',
  environment: 'sandbox',
  toolSelectionSummary: '1 selected Tool',
  accessSummary: 'A$12.50 daily spend; 8 Calls per minute',
  expiresInSeconds: 7_200,
  grantRevision: 7,
  grantRef: 'grant:exact-request',
  toolRefs: [`operation:v1:${'a'.repeat(64)}`, `operation:v1:${'b'.repeat(64)}`],
  flow: 'authorization_code',
  redirectDisposition: 'origin',
  redirectOrigin: 'https://customer.example',
}

afterEach(cleanup)

describe('access request context', () => {
  it.each(['context', 'authority', 'review'] as const)('retains application and return site in %s, with decision-relevant facts', presentation => {
    render(<ConsentRequestFacts {...props} presentation={presentation} />)

    expect(screen.getByText('Customer app · Sandbox')).toBeInTheDocument()
    expect(screen.getByText('https://customer.example')).toBeInTheDocument()
    if (presentation === 'context') {
      expect(screen.queryByText(props.accessSummary)).not.toBeInTheDocument()
    } else {
      expect(screen.getByRole('heading', { name: 'Requested limits' })).toBeInTheDocument()
      expect(screen.getByText(props.accessSummary)).toBeInTheDocument()
    }
    if (presentation === 'review') {
      expect(screen.getByText('1 selected Tool')).toBeInTheDocument()
      expect(screen.getByText('Stays signed in for 2 hours after approval, unless you disconnect it first.')).toBeInTheDocument()
    } else {
      expect(screen.queryByText('1 selected Tool')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Connection' })).not.toBeInTheDocument()
    }
    expect(document.getElementById('consent-expiry')).toHaveTextContent('Access expires 2 hours after issue.')
    expect(screen.queryByText(props.grantRef)).not.toBeInTheDocument()
  })

  it('retains the full review by default for existing callers', () => {
    render(<ConsentRequestFacts {...props} />)
    expect(screen.getByText(props.accessSummary)).toBeInTheDocument()
    expect(screen.getByText(props.toolSelectionSummary)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Approved limits' })).not.toBeInTheDocument()
  })

  it.each(['context', 'review'] as const)('retains unavailable-return refusal in %s', presentation => {
    const { redirectOrigin: _origin, ...withoutOrigin } = props
    render(<ConsentRequestFacts {...withoutOrigin} presentation={presentation} redirectDisposition="unavailable" />)
    expect(screen.getByText('Return site unavailable. Decline this request.')).toBeInTheDocument()
    expect(screen.queryByText('This request does not redirect your browser.')).not.toBeInTheDocument()
  })

  it('discloses exact original request metadata separately from the selected Tool count', () => {
    render(<ConsentRequestFacts {...props} presentation="context" />)
    const disclosure = screen.getByRole('button', { name: 'Technical details' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(props.toolRefs.join(', '))).not.toBeInTheDocument()

    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(props.grantRef)).toBeInTheDocument()
    expect(screen.getByText(String(props.grantRevision))).toBeInTheDocument()
    expect(screen.getByText(props.toolRefs.join(', '))).toBeInTheDocument()
    expect(screen.queryByText(props.toolSelectionSummary)).not.toBeInTheDocument()
  })
})
