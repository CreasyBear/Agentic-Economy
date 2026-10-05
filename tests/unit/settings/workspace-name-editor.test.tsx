/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const source = vi.hoisted(() => ({
  renameUnbound: vi.fn(),
  renameBound: vi.fn(),
}))

vi.mock('convex/react', () => ({ useMutation: () => source.renameUnbound }))
vi.mock('@/lib/server/workspace-profile.functions', () => ({ renameWorkspaceServer: (input: unknown) => source.renameBound(input) }))

import { WorkspaceNameEditor, type WorkspaceNameEditorProps } from '@/components/ae/settings/WorkspaceNameEditor'

const initialProps: WorkspaceNameEditorProps = {
  name: 'Buyer workspace',
  canonicalName: 'Buyer workspace',
  accountRevision: 17,
  clerkOrgId: 'org_workspace',
  canEdit: true,
}

function renderEditor(overrides: Partial<WorkspaceNameEditorProps> = {}) {
  return render(<WorkspaceNameEditor {...initialProps} {...overrides} />)
}

function getNameInput() {
  return screen.getByRole('textbox', { name: 'Workspace name' })
}

function getSaveButton() {
  return screen.getByRole('button', { name: /Save workspace name|Saving/ })
}

function changeName(value: string) {
  fireEvent.change(getNameInput(), { target: { value } })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

beforeEach(() => {
  source.renameUnbound.mockResolvedValue({ kind: 'updated', name: 'Renamed workspace' })
  source.renameBound.mockResolvedValue({ kind: 'updated', name: 'Renamed workspace' })
})

describe('WorkspaceNameEditor', () => {
  it('shows read-only identity without an editor or save bar', () => {
    renderEditor({ canEdit: false })

    expect(screen.getByText('Buyer workspace')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Workspace name' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Save workspace name/ })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).toBeNull()
  })

  it('shows no unsaved count for a pristine name and validates a dirty draft', () => {
    renderEditor()

    expect(getNameInput()).toBeVisible()
    expect(screen.queryByRole('button', { name: /Save workspace name/ })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).toBeNull()

    changeName('   ')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name of 1 to 200 characters.')
    expect(getNameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(getSaveButton()).toBeDisabled()
    expect(screen.getByRole('group', { name: 'Unsaved changes' })).toHaveTextContent('1 unsaved change')
  })

  it('locks the draft while saving and keeps the request latched after acceptance until the prop echoes', async () => {
    const request = deferred<{ kind: 'updated'; name: string }>()
    source.renameBound.mockReturnValueOnce(request.promise)
    const page = renderEditor()
    const input = getNameInput()

    changeName('Renamed workspace')
    getSaveButton().focus()
    fireEvent.click(getSaveButton())

    expect(input).toBeDisabled()
    expect(getSaveButton()).toBeDisabled()
    expect(source.renameBound).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('group', { name: 'Unsaved changes' })).toHaveTextContent('Saving')

    fireEvent.submit(input.closest('form')!)
    expect(source.renameBound).toHaveBeenCalledTimes(1)

    await act(async () => request.resolve({ kind: 'updated', name: 'Renamed workspace' }))

    expect(input).toBeDisabled()
    expect(screen.getByText('Name saved. Waiting for the workspace to confirm it…')).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Save status' })).toBeNull()

    page.rerender(<WorkspaceNameEditor {...initialProps} name="Renamed workspace" canonicalName="Renamed workspace" accountRevision={18} />)

    await waitFor(() => expect(screen.getByRole('group', { name: 'Save status' })).toHaveTextContent('Workspace name saved and confirmed'))
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('keeps confirmed success when the matching prop echo arrives before the request resolves', async () => {
    const request = deferred<{ kind: 'updated'; name: string }>()
    source.renameBound.mockReturnValueOnce(request.promise)
    const page = renderEditor()
    const input = getNameInput()

    changeName('Renamed workspace')
    getSaveButton().focus()
    fireEvent.click(getSaveButton())

    page.rerender(<WorkspaceNameEditor {...initialProps} name="Renamed workspace" canonicalName="Renamed workspace" accountRevision={18} />)

    await waitFor(() => expect(screen.getByText('Workspace name saved and confirmed.')).toBeVisible())
    expect(input).toBeDisabled()

    await act(async () => request.resolve({ kind: 'updated', name: 'Renamed workspace' }))

    expect(screen.getByText('Workspace name saved and confirmed.')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('group', { name: 'Save status' })).toHaveTextContent('Workspace name saved and confirmed'))
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('retains a refused draft and enables an explicit retry', async () => {
    source.renameBound
      .mockResolvedValueOnce({ kind: 'refused', code: 'forbidden' })
      .mockResolvedValueOnce({ kind: 'updated', name: 'Renamed workspace' })
    renderEditor()
    changeName('Renamed workspace')

    fireEvent.click(getSaveButton())

    expect(await screen.findByText('Only the workspace owner can change its name.')).toBeVisible()
    expect(getNameInput()).toHaveValue('Renamed workspace')
    expect(getSaveButton()).toBeEnabled()

    fireEvent.click(getSaveButton())

    expect(source.renameBound).toHaveBeenCalledTimes(2)
    expect(getNameInput()).toHaveValue('Renamed workspace')
    expect(await screen.findByText('Name saved. Waiting for the workspace to confirm it…')).toBeVisible()
  })

  it('waits for canonical confirmation when the display name already matches the requested alias', async () => {
    const page = renderEditor({ name: 'Your workspace', canonicalName: 'user_private_ref', clerkOrgId: null })
    const input = getNameInput()
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByText('Name saved. Waiting for the workspace to confirm it…')).toBeVisible()
    expect(input).toBeDisabled()
    expect(screen.queryByRole('group', { name: 'Save status' })).toBeNull()
    page.rerender(<WorkspaceNameEditor {...initialProps} name="Your workspace" canonicalName="Your workspace" clerkOrgId={null} accountRevision={18} />)
    await waitFor(() => expect(screen.getByRole('group', { name: 'Save status' })).toHaveTextContent('Workspace name saved and confirmed'))
    expect(input).toBeEnabled()
  })

  it('keeps committed canonical readback when a later transport failure arrives', async () => {
    const request = deferred<{ kind: 'updated'; name: string }>()
    source.renameBound.mockReturnValueOnce(request.promise)
    const page = renderEditor()
    changeName('Renamed workspace')
    fireEvent.click(getSaveButton())
    page.rerender(<WorkspaceNameEditor {...initialProps} name="Renamed workspace" canonicalName="Renamed workspace" accountRevision={18} />)
    await act(async () => request.reject(new Error('response lost after readback')))
    expect(screen.getByRole('group', { name: 'Save status' })).toHaveTextContent('Workspace name saved and confirmed')
    expect(getNameInput()).toHaveValue('Renamed workspace')
    expect(getNameInput()).toBeEnabled()
    expect(screen.queryByText('Name was not saved. Try again; the existing name is unchanged.')).toBeNull()
  })

  it('retains a rejected draft and permits retry after reporting failure', async () => {
    source.renameBound
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ kind: 'updated', name: 'Renamed workspace' })
    renderEditor()
    changeName('Renamed workspace')

    fireEvent.click(getSaveButton())

    expect(await screen.findByText('Name was not saved. Try again; the existing name is unchanged.')).toBeVisible()
    expect(getNameInput()).toHaveValue('Renamed workspace')
    expect(getSaveButton()).toBeEnabled()

    fireEvent.click(getSaveButton())

    expect(source.renameBound).toHaveBeenCalledTimes(2)
    expect(getNameInput()).toHaveValue('Renamed workspace')
    expect(await screen.findByText('Name saved. Waiting for the workspace to confirm it…')).toBeVisible()
  })

  it('uses the exact unbound revision and idempotency payload and reuses its key after a failed attempt', async () => {
    const request = deferred<{ kind: 'updated'; name: string }>()
    source.renameUnbound.mockReturnValueOnce(request.promise).mockResolvedValueOnce({ kind: 'updated', name: 'Renamed workspace' })
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
    renderEditor({ clerkOrgId: null, accountRevision: 42 })
    changeName('Renamed workspace')

    fireEvent.click(getSaveButton())

    const expectedPayload = {
      name: 'Renamed workspace',
      expectedRevision: 42,
      correlationRef: 'ui:workspace-name:save',
      idempotencyRef: 'idem:workspace-name:11111111-1111-4111-8111-111111111111',
    }
    expect(source.renameUnbound).toHaveBeenLastCalledWith(expectedPayload)

    await act(async () => request.reject(new Error('temporary failure')))
    expect(await screen.findByText('Name was not saved. Try again; the existing name is unchanged.')).toBeVisible()
    expect(getNameInput()).toHaveValue('Renamed workspace')
    expect(getSaveButton()).toBeEnabled()

    fireEvent.click(getSaveButton())

    expect(source.renameUnbound).toHaveBeenCalledTimes(2)
    expect(source.renameUnbound).toHaveBeenLastCalledWith(expectedPayload)
    expect(await screen.findByText('Name saved. Waiting for the workspace to confirm it…')).toBeVisible()
  })
})
