// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DecommissionFenceList } from './DecommissionFenceList'

describe('DecommissionFenceList', () => {
  it('renders fence messages and blocked badge', () => {
    render(
      <DecommissionFenceList
        fenceMessages={['Provider obligations are still unsettled.', 'One or more Calls are still open.']}
      />,
    )
    expect(screen.getByText(/close blocked/i)).toBeInTheDocument()
    expect(screen.getByText(/provider obligations are still unsettled/i)).toBeInTheDocument()
    expect(screen.getByText(/one or more calls are still open/i)).toBeInTheDocument()
  })
})
