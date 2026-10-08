/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { ProviderNameEditor, type ProviderNameEditorProps } from '@/components/ae/settings/ProviderNameEditor'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { RenameProviderDisplayNameResult } from '@/lib/server/owner-workspace.functions'

vi.mock('@/lib/observability/capture-client-exception', () => ({
  captureClientExceptionOnClient: vi.fn(),
}))

type RenameInput = Parameters<ProviderNameEditorProps['onRename']>[0]
type RenameResult = RenameProviderDisplayNameResult

const updated = (name: string): RenameResult => ({
  kind: 'updated',
  businessId: 'business-17',
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  name,
})

const unchanged = (name: string): RenameResult => ({
  kind: 'unchanged',
  businessId: 'business-17',
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  name,
})

function createOnRename(result: RenameResult = updated('Northstar Labs')) {
  return vi.fn<ProviderNameEditorProps['onRename']>().mockResolvedValue(result)
}

function getRenameInput(onRename: ReturnType<typeof createOnRename>, index: number): RenameInput {
  const call = onRename.mock.calls[index]
  if (!call) throw new Error(`Expected onRename call at index ${index}`)
  return call[0]
}

function renderEditor(
  onRename: ProviderNameEditorProps['onRename'],
  currentName = 'Northstar',
) {
  return render(
    <ProviderNameEditor businessId="business-17" currentName={currentName} onRename={onRename} />,
  )
}

function getNameInput() {
  return screen.getByRole('textbox', { name: 'Public Provider name' })
}

function getForm() {
  const form = getNameInput().closest('form')
  if (!form) throw new Error('Provider name editor is not inside a form')
  return form
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProviderNameEditor', () => {
  it('starts pristine without a save bar', () => {
    renderEditor(createOnRename())

    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Save status' })).not.toBeInTheDocument()
  })

  it('treats a draft that normalizes to currentName as unchanged', () => {
    const onRename = createOnRename()
    renderEditor(onRename, 'Café')
    fireEvent.change(getNameInput(), { target: { value: '  Cafe\u0301  ' } })

    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).not.toBeInTheDocument()
    fireEvent.submit(getForm())
    expect(onRename).not.toHaveBeenCalled()
  })

  it('submits the exact raw Unicode and whitespace name with its business and edit request key', async () => {
    const onRename = createOnRename()
    renderEditor(onRename)
    const rawName = '  Cafe\u0301  東京  '
    fireEvent.change(getNameInput(), { target: { value: rawName } })

    expect(screen.getByRole('group', { name: 'Unsaved changes' })).toHaveTextContent('1 unsaved change')
    fireEvent.submit(getForm())

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith({
        businessId: 'business-17',
        name: rawName,
        requestKey: expect.any(String),
      })
    })
    expect(getRenameInput(onRename, 0).name).toBe(rawName)
  })

  it.each([
    ['Ctrl+S', { ctrlKey: true }],
    ['Command+S', { metaKey: true }],
  ] as const)('%s submits through the native form', async (_label, modifiers) => {
    const onRename = createOnRename()
    renderEditor(onRename)
    fireEvent.change(getNameInput(), { target: { value: 'New name' } })

    fireEvent.keyDown(getNameInput(), { key: 's', ...modifiers })

    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1))
    expect(getRenameInput(onRename, 0)).toMatchObject({ businessId: 'business-17', name: 'New name' })
  })

  it('submits native form events once and disables the editor while pending', async () => {
    const attempt = deferred<RenameResult>()
    const onRename = vi.fn<ProviderNameEditorProps['onRename']>(() => attempt.promise)
    renderEditor(onRename)
    fireEvent.change(getNameInput(), { target: { value: 'Pending name' } })
    const form = getForm()

    fireEvent.submit(form)
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1))
    expect(getNameInput()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving public name…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving public name…' })).toHaveAttribute('aria-busy', 'true')

    fireEvent.submit(form)
    expect(onRename).toHaveBeenCalledTimes(1)

    attempt.resolve(updated('Pending name'))
    await screen.findByRole('group', { name: 'Save status' })
  })

  it.each(['typed refusal', 'asynchronous rejection', 'synchronous throw'] as const)(
    'preserves the raw draft and request key for retry after a %s',
    async (failureKind) => {
      const cause = new Error('provider rename unavailable')
      const onRename = vi.fn<ProviderNameEditorProps['onRename']>()
      if (failureKind === 'typed refusal') {
        onRename.mockResolvedValueOnce({ kind: 'refused', code: 'source_unavailable' })
      } else if (failureKind === 'asynchronous rejection') {
        onRename.mockRejectedValueOnce(cause)
      } else {
        onRename.mockImplementationOnce(() => { throw cause })
      }
      onRename.mockResolvedValueOnce(updated('Retry name'))
      renderEditor(onRename)
      const rawName = '  Retry name  '
      fireEvent.change(getNameInput(), { target: { value: rawName } })
      const form = getForm()

      fireEvent.submit(form)
      await screen.findByRole('alert')
      expect(getNameInput()).toHaveValue(rawName)
      expect(getNameInput()).toBeDisabled()
      expect(screen.getByRole('alert')).toHaveTextContent('The rename may have been recorded.')
      const firstPayload = getRenameInput(onRename, 0)
      expect(firstPayload).toMatchObject({ businessId: 'business-17', name: rawName, requestKey: expect.any(String) })

      if (failureKind === 'typed refusal') {
        expect(captureClientExceptionOnClient).not.toHaveBeenCalled()
      } else {
        expect(captureClientExceptionOnClient).toHaveBeenCalledWith(cause)
      }

      fireEvent.submit(form)
      await waitFor(() => expect(onRename).toHaveBeenCalledTimes(2))
      expect(getRenameInput(onRename, 1)).toEqual(firstPayload)
    },
  )

  it.each([
    ['updated', updated('Authoritative name')],
    ['unchanged', unchanged('Candidate name')],
  ] as const)('shows confirmed %s feedback only after the callback resolves and returns focus to the input', async (_kind, result) => {
    const attempt = deferred<RenameResult>()
    const onRename = vi.fn<ProviderNameEditorProps['onRename']>(() => attempt.promise)
    renderEditor(onRename)
    const input = getNameInput()
    fireEvent.change(input, { target: { value: 'Candidate name' } })
    const saveButton = screen.getByRole('button', { name: 'Save public name' })
    saveButton.focus()
    fireEvent.submit(getForm())

    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('group', { name: 'Save status' })).not.toBeInTheDocument()

    attempt.resolve(result)
    await screen.findByRole('group', { name: 'Save status' })
    expect(screen.getByRole('status')).toHaveTextContent('Public name saved. The Provider listing and current Tools now use')
    expect(input).toHaveValue(result.kind === 'updated' ? result.name : 'Candidate name')
    expect(document.activeElement).toBe(input)
  })

  it('clears confirmed feedback when currentName changes from the parent', async () => {
    const onRename = createOnRename(updated('Accepted name'))
    const view = renderEditor(onRename, 'Northstar')
    fireEvent.change(getNameInput(), { target: { value: 'Candidate name' } })
    fireEvent.submit(getForm())
    await screen.findByRole('group', { name: 'Save status' })

    view.rerender(
      <ProviderNameEditor businessId="business-17" currentName="External update" onRename={onRename} />,
    )

    expect(getNameInput()).toHaveValue('External update')
    expect(screen.queryByRole('group', { name: 'Save status' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Public name saved/u)).not.toBeInTheDocument()
  })

  it.each([
    ['empty', '', true],
    ['whitespace only', '   \t ', true],
    ['160 normalized characters', 'x'.repeat(160), false],
    ['161 normalized characters', 'x'.repeat(161), true],
  ] as const)('keeps the existing validation boundary for %s input', async (_label, value, invalid) => {
    const onRename = createOnRename()
    renderEditor(onRename)
    fireEvent.change(getNameInput(), { target: { value } })

    const input = getNameInput()
    const saveButton = screen.getByRole('button', { name: 'Save public name' })
    if (invalid) {
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(saveButton).toBeDisabled()
      fireEvent.submit(getForm())
      await Promise.resolve()
      expect(onRename).not.toHaveBeenCalled()
    } else {
      expect(input).not.toHaveAttribute('aria-invalid')
      expect(saveButton).toBeEnabled()
    }
  })
})

it('keeps a dirty draft across an unrelated source update', () => {
  const onRename = createOnRename()
  const view = renderEditor(onRename)
  fireEvent.change(getNameInput(), { target: { value: 'My draft' } })
  view.rerender(<ProviderNameEditor businessId="business-17" currentName="External name" onRename={onRename} />)
  expect(getNameInput()).toHaveValue('My draft')
  expect(screen.getByRole('status')).toHaveTextContent('Your draft is retained')
})
it('keeps same-request retry available when a matching readback arrives after response loss', async () => {
  const onRename = createOnRename()
  onRename.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(unchanged('New name'))
  const view = renderEditor(onRename)
  fireEvent.change(getNameInput(), { target: { value: 'New name' } })
  fireEvent.submit(getForm())
  await screen.findByRole('alert')
  const original = getRenameInput(onRename, 0)
  view.rerender(<ProviderNameEditor businessId="business-17" currentName="New name" onRename={onRename} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retry same rename' }))
  await waitFor(() => expect(onRename).toHaveBeenCalledTimes(2))
  expect(getRenameInput(onRename, 1)).toEqual(original)
  await waitFor(() => expect(getNameInput()).toBeEnabled())
})
