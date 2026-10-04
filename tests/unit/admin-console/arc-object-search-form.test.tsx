/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { AdminObjectSearchForm } from '@/components/ae/admin/object-search/components/AdminObjectSearchForm'

afterEach(cleanup)

it('submits the exact reference with the initially selected object kind', () => {
  const onSubmit = vi.fn()
  render(<AdminObjectSearchForm initialKind="quote" initialRef="quote:v1:original" state={{ kind: 'idle' }} onSubmit={onSubmit} />)
  const reference = screen.getByRole('searchbox', { name: 'Reference' })
  expect(reference).toHaveValue('quote:v1:original')
  fireEvent.change(reference, { target: { value: '  quote:v1:full-reference  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ kind: 'quote', ref: '  quote:v1:full-reference  ' })
})

it('uses the selected kind after keyboard selection and returns focus to its trigger', async () => {
  const onSubmit = vi.fn()
  render(<AdminObjectSearchForm initialRef="provider-slug" state={{ kind: 'idle' }} onSubmit={onSubmit} />)
  const kind = screen.getByRole('combobox', { name: 'Object type' })
  fireEvent.click(kind)
  const first = await screen.findByRole('option', { name: 'Call' })
  fireEvent.keyDown(first, { key: 'End' })
  const provider = screen.getByRole('option', { name: 'Provider' })
  await waitFor(() => expect(provider).toHaveFocus())
  fireEvent.keyDown(provider, { key: 'Enter' })
  fireEvent.keyUp(provider, { key: 'Enter' })
  await waitFor(() => expect(kind).toHaveFocus())
  expect(kind).toHaveTextContent('Provider')
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ kind: 'provider', ref: 'provider-slug' })
})

it('blocks click and native form submission while the current search is pending', () => {
  const onSubmit = vi.fn()
  render(<AdminObjectSearchForm state={{ kind: 'searching' }} onSubmit={onSubmit} />)
  const submit = screen.getByRole('button', { name: 'Searching…' })
  expect(submit).toBeDisabled()
  const form = submit.closest('form')
  if (form === null) throw new Error('admin_search_form_missing')
  expect(form).toHaveAttribute('aria-busy', 'true')
  fireEvent.click(submit)
  fireEvent.submit(form)
  expect(onSubmit).not.toHaveBeenCalled()
})

it('keeps refused or invalid feedback associated with the field and neutral results polite', () => {
  const onSubmit = vi.fn()
  const { rerender } = render(<AdminObjectSearchForm state={{ kind: 'message', tone: 'error', text: 'The Call reference is not valid.' }} onSubmit={onSubmit} />)
  const reference = screen.getByRole('searchbox', { name: 'Reference' })
  expect(reference).toHaveAttribute('aria-invalid', 'true')
  expect(reference).toHaveAccessibleDescription('The Call reference is not valid.')
  expect(screen.getByRole('alert')).toHaveAttribute('id', 'admin-object-search-message')
  rerender(<AdminObjectSearchForm state={{ kind: 'message', tone: 'neutral', text: 'No object with that reference.' }} onSubmit={onSubmit} />)
  expect(reference).not.toHaveAttribute('aria-invalid')
  expect(reference).toHaveAccessibleDescription('No object with that reference.')
  expect(screen.getByRole('status')).toHaveTextContent('No object with that reference.')
  expect(screen.queryByRole('alert')).toBeNull()
})
