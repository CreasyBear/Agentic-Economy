/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const toastState = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastState.success(...args),
    error: (...args: unknown[]) => toastState.error(...args),
  },
}))

import { TaxProfileForm } from '@/components/ae/settings/TaxProfileForm'
import type { TaxProfileInitialData } from '@/modules/money/tax-profile.view-model'

afterEach(() => {
  cleanup()
  toastState.success.mockReset()
  toastState.error.mockReset()
})

describe('TaxProfileForm', () => {
  it('U1: renders legal entity, ABN, and AU billing address fields', () => {
    const onSubmit = vi.fn()
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    expect(screen.getByLabelText(/legal business name/i)).toBeTruthy()
    expect(screen.getByLabelText(/^abn$/i)).toBeTruthy()
    expect(screen.getByLabelText(/^address$/i)).toBeTruthy()
    expect(screen.getByLabelText(/city\/locality/i)).toBeTruthy()
    expect(screen.getByLabelText(/state\/region/i)).toBeTruthy()
    expect(screen.getByLabelText(/postal code/i)).toBeTruthy()
    expect(screen.getByLabelText(/country/i)).toHaveValue('AU')
  })

  it('U2: invalid ABN shows Rule 4 diagnostic and blocks save', async () => {
    const onSubmit = vi.fn()
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/^abn$/i), { target: { value: '12 345 678 901' } })
    fireEvent.change(screen.getByLabelText(/legal business name/i), { target: { value: 'Acme Pty Ltd' } })
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: '1 Market Street' } })
    fireEvent.change(screen.getByLabelText(/city\/locality/i), { target: { value: 'Sydney' } })
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: '2000' } })

    await waitFor(() => {
      expect(screen.getByText(/invalid abn or incomplete billing address/i)).toBeTruthy()
      expect(screen.getByText(/A\$0\.00 affected — tax profile not saved/i)).toBeTruthy()
    })

    const saveButton = screen.getByRole('button', { name: /^save$/i })
    expect(saveButton).not.toBeDisabled()

    fireEvent.click(saveButton)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^abn$/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^abn$/i)).toHaveAttribute('aria-describedby', 'tax-profile-diagnostic')
  })

  it('U3: spaced valid ABN clears the validation diagnostic', async () => {
    const onSubmit = vi.fn()
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/^abn$/i), { target: { value: '51 824 753 556' } })
    fireEvent.change(screen.getByLabelText(/legal business name/i), { target: { value: 'Acme Pty Ltd' } })
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: '1 Market Street' } })
    fireEvent.change(screen.getByLabelText(/city\/locality/i), { target: { value: 'Sydney' } })
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: '2000' } })

    await waitFor(() => {
      expect(screen.queryByText(/invalid abn or incomplete billing address/i)).toBeNull()
    })
  })

  it('U4: empty legal name blocks submit without calling onSubmit', () => {
    const onSubmit = vi.fn()
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/^abn$/i), { target: { value: '51824753556' } })
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: '1 Market Street' } })
    fireEvent.change(screen.getByLabelText(/city\/locality/i), { target: { value: 'Sydney' } })
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: '2000' } })

    const saveButton = screen.getByRole('button', { name: /^save$/i })
    expect(saveButton).not.toBeDisabled()
    fireEvent.click(saveButton)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/legal business name/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/legal business name/i)).toHaveAttribute(
      'aria-describedby',
      'tax-profile-diagnostic',
    )
  })

  it('U5: valid submission calls onSubmit with normalized payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/legal business name/i), { target: { value: '  Acme Technologies Pty Ltd  ' } })
    fireEvent.change(screen.getByLabelText(/^abn$/i), { target: { value: '51 824 753 556' } })
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: ' 1 Market Street ' } })
    fireEvent.change(screen.getByLabelText(/city\/locality/i), { target: { value: ' Sydney ' } })
    fireEvent.change(screen.getByLabelText(/state\/region/i), { target: { value: ' NSW ' } })
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: '2000' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        abn: '51824753556',
        legalName: 'Acme Technologies Pty Ltd',
        addressLine1: '1 Market Street',
        locality: 'Sydney',
        region: 'NSW',
        postalCode: '2000',
        country: 'AU',
        expectedRevision: 0,
      })
      expect(toastState.success).toHaveBeenCalledWith('Billing & tax profile updated')
    })
  })

  it('U6: prefills fields when initialData is available', () => {
    const onSubmit = vi.fn()
    const initialData: TaxProfileInitialData = {
      kind: 'available',
      abn: '51824753556',
      legalName: 'Acme Technologies Pty Ltd',
      addressLine1: '1 Market Street',
      locality: 'Sydney',
      region: 'NSW',
      postalCode: '2000',
      country: 'AU',
      revision: 2,
    }

    render(<TaxProfileForm initialData={initialData} onSubmit={onSubmit} />)

    expect(screen.getByLabelText(/legal business name/i)).toHaveValue('Acme Technologies Pty Ltd')
    expect(screen.getByLabelText(/^abn$/i)).toHaveValue('51 824 753 556')
    expect(screen.getByLabelText(/^address$/i)).toHaveValue('1 Market Street')
    expect(screen.getByLabelText(/city\/locality/i)).toHaveValue('Sydney')
    expect(screen.getByLabelText(/state\/region/i)).toHaveValue('NSW')
    expect(screen.getByLabelText(/postal code/i)).toHaveValue('2000')
  })

  it('U7: live ABN input formats to spaced groups and uses monospace tabular classes', () => {
    const onSubmit = vi.fn()
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    const abnInput = screen.getByLabelText(/^abn$/i)
    expect(abnInput.className).toMatch(/font-mono/)
    expect(abnInput.className).toMatch(/tabular-nums/)

    fireEvent.change(abnInput, { target: { value: '51824753556' } })
    expect(abnInput).toHaveValue('51 824 753 556')
  })

  it('U8: async submit failure shows Rule 4 triplet and toast.error', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('network'))
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/legal business name/i), { target: { value: 'Acme Pty Ltd' } })
    fireEvent.change(screen.getByLabelText(/^abn$/i), { target: { value: '51 824 753 556' } })
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: '1 Market Street' } })
    fireEvent.change(screen.getByLabelText(/city\/locality/i), { target: { value: 'Sydney' } })
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: '2000' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(toastState.error).toHaveBeenCalledWith('Billing & tax profile was not saved')
      expect(screen.getByText(/billing and tax profile could not be saved/i)).toBeTruthy()
    })
  })
})
