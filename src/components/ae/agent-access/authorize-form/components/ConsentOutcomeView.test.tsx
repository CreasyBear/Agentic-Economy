// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ConsentOutcomeView } from './ConsentOutcomeView'

describe('ConsentOutcomeView', () => {
  it('renders security correlation reference on error phase', () => {
    render(
      <ConsentOutcomeView
        phase="error"
        clientName="CLI"
        grantRef="grant-1"
        errorCode="security_control_unavailable"
        errorReference="oauth:grant:grant-rate-down:reserve:1"
        authorizeRecoverySearch={{ grant_ref: 'grant-1' }}
      />,
    )
    expect(screen.getByText(/oauth:grant:grant-rate-down:reserve:1/u)).toBeTruthy()
  })

  it('renders approved copy without recovery link', () => {
    render(
      <ConsentOutcomeView
        phase="approved"
        clientName="Test assistant"
        grantRef="grant-1"
        authorizeRecoverySearch={{ grant_ref: 'grant-1' }}
      />,
    )
    expect(screen.getByText('Access approved for Test assistant')).toBeTruthy()
    expect(screen.queryByText('Connected to Test assistant')).toBeNull()
    expect(screen.getByText(/Check the Agents page for authenticated access and Tool results/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Check approval status' })).toBeNull()
  })
})
