/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { FormEvent } from 'react'
import '../../setup/jsdom-platform'

import { HttpCredentialForm } from '@/components/ae/supply/connection-handoff/components/HttpCredentialForm'
import { McpOAuthStartPanel } from '@/components/ae/supply/connection-handoff/components/McpOAuthStartPanel'

afterEach(cleanup)

it('keeps credentials masked and sends raw edits and submit through the existing callbacks', () => {
  const onCredentialChange = vi.fn()
  const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())
  const onCancel = vi.fn()
  render(<HttpCredentialForm sourceOriginLabel="https://provider.example" credentialLabel="Bearer token"
    credential="opaque-secret" busy={false} error={undefined}
    onCredentialChange={onCredentialChange} onSubmit={onSubmit} onCancel={onCancel} />)
  const field = screen.getByLabelText('Bearer token')
  expect(field).toHaveAttribute('type', 'password')
  expect(field).toHaveAttribute('autocomplete', 'off')
  expect(field).toHaveAttribute('maxlength', '32768')
  expect(screen.queryByText('opaque-secret')).not.toBeInTheDocument()
  fireEvent.change(field, { target: { value: ' raw:new-token ' } })
  expect(onCredentialChange).toHaveBeenCalledWith(' raw:new-token ')
  fireEvent.click(screen.getByRole('button', { name: 'Connect Provider' }))
  expect(onSubmit).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onCancel).toHaveBeenCalledOnce()
})

it('announces the real credential error and blocks editing, submission and cancellation while busy', () => {
  const onCredentialChange = vi.fn()
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(<HttpCredentialForm sourceOriginLabel="https://provider.example" credentialLabel="Bearer token"
    credential="" busy error="The credential could not be stored. No Provider connection was created."
    onCredentialChange={onCredentialChange} onSubmit={onSubmit} onCancel={onCancel} />)
  const field = screen.getByLabelText('Bearer token')
  expect(field).toBeDisabled()
  expect(field).toHaveAttribute('aria-invalid', 'true')
  expect(field).toHaveAccessibleDescription(screen.getByRole('alert').textContent ?? '')
  const submit = screen.getByRole('button', { name: 'Connecting…' })
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  expect(submit).toBeDisabled()
  expect(cancel).toBeDisabled()
  fireEvent.click(submit)
  fireEvent.click(cancel)
  expect(onSubmit).not.toHaveBeenCalled()
  expect(onCancel).not.toHaveBeenCalled()
})

it('keeps sign-in and cancellation as separate real operations with their original pending guards', () => {
  const onBegin = vi.fn()
  const onCancel = vi.fn()
  const view = render(<McpOAuthStartPanel sourceOriginLabel="https://provider.example" beginBusy={false}
    cancelBusy={false} error="Consent could not be started." onBegin={onBegin} onCancel={onCancel} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Sign in not started')
  expect(screen.getByRole('alert')).toHaveTextContent('Consent could not be started.')
  fireEvent.click(screen.getByRole('button', { name: 'Continue to sign in' }))
  expect(onBegin).toHaveBeenCalledOnce()
  expect(onCancel).not.toHaveBeenCalled()
  view.rerender(<McpOAuthStartPanel sourceOriginLabel="https://provider.example" beginBusy
    cancelBusy={false} error={undefined} onBegin={onBegin} onCancel={onCancel} />)
  expect(screen.getByRole('button', { name: 'Opening sign in…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  view.rerender(<McpOAuthStartPanel sourceOriginLabel="https://provider.example" beginBusy={false}
    cancelBusy error={undefined} onBegin={onBegin} onCancel={onCancel} />)
  expect(screen.getByRole('button', { name: 'Continue to sign in' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
})
