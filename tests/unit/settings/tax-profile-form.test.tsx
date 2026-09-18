/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { TaxProfileForm } from '@/components/ae/settings/TaxProfileForm'

type TaxProfileInitialData =
  | Readonly<{ kind: 'missing'; revision: 0 }>
  | Readonly<{
      kind: 'available'
      abn: string
      legalName: string
      addressLine1: string
      addressLine2?: string
      locality: string
      region?: string
      postalCode: string
      country: 'AU'
      revision: number
    }>

afterEach(cleanup)

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

  it('U2: invalid ABN shows validation error and blocks save', async () => {
    const onSubmit = vi.fn()
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/^abn$/i), { target: { value: '12 345 678 901' } })
    fireEvent.change(screen.getByLabelText(/legal business name/i), { target: { value: 'Acme Pty Ltd' } })
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: '1 Market Street' } })
    fireEvent.change(screen.getByLabelText(/city\/locality/i), { target: { value: 'Sydney' } })
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: '2000' } })

    await waitFor(() => {
      expect(screen.getByText(/invalid abn/i)).toBeTruthy()
    })

    const saveButton = screen.getByRole('button', { name: /save/i })
    expect(saveButton).toBeDisabled()

    fireEvent.click(saveButton)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('U3: spaced valid ABN clears the validation error', async () => {
    const onSubmit = vi.fn()
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/^abn$/i), { target: { value: '51 824 753 556' } })

    await waitFor(() => {
      expect(screen.queryByText(/invalid abn/i)).toBeNull()
    })
  })

  it('U4: empty legal name disables save', () => {
    const onSubmit = vi.fn()
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/^abn$/i), { target: { value: '51824753556' } })
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: '1 Market Street' } })
    fireEvent.change(screen.getByLabelText(/city\/locality/i), { target: { value: 'Sydney' } })
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: '2000' } })

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('U5: valid submission calls onSubmit with normalized payload', () => {
    const onSubmit = vi.fn()
    render(<TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/legal business name/i), { target: { value: '  Acme Technologies Pty Ltd  ' } })
    fireEvent.change(screen.getByLabelText(/^abn$/i), { target: { value: '51 824 753 556' } })
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: ' 1 Market Street ' } })
    fireEvent.change(screen.getByLabelText(/city\/locality/i), { target: { value: ' Sydney ' } })
    fireEvent.change(screen.getByLabelText(/state\/region/i), { target: { value: ' NSW ' } })
    fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: '2000' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

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
})
