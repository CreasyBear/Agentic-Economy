// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Integrations, type IntegrationRecord } from '@/components/arc/blocks/integrations/integrations'

afterEach(cleanup)

const first: IntegrationRecord = {
  id: 'connection:one', targetId: 'provider-connection-one',
  name: 'POST https://first.example/paid', description: 'Sandbox',
  lifecycleLabel: 'Active', healthLabel: 'Not checked',
  facts: [{ label: 'Authority generation', value: '4' }], detail: null,
}
const second: IntegrationRecord = {
  ...first, id: 'connection:two', targetId: 'provider-connection-two',
  name: 'GET https://second.example/paid', description: 'Production', lifecycleLabel: 'Revoked', healthLabel: 'Unavailable',
}

describe('Arc connection directory', () => {
  it('filters the supplied facts without changing source order or invoking connection actions', async () => {
    const mutate = vi.fn()
    render(<Integrations records={[second, { ...first, actions: <button type="button" onClick={mutate}>Check first</button> }]} />)
    const list = screen.getByRole('list', { name: 'Provider connections' })
    expect(within(list).getAllByRole('heading').map((item) => item.textContent)).toEqual([second.name, first.name])
    for (const query of [' FIRST.EXAMPLE ', 'sandbox', 'Active', 'Not checked']) {
      fireEvent.change(screen.getByLabelText('Find a connection'), { target: { value: query } })
      expect(within(list).getAllByRole('heading').map((item) => item.textContent)).toEqual([first.name])
    }
    fireEvent.click(screen.getByRole('button', { name: `Inspect ${first.name}` }))
    expect(within(await screen.findByRole('dialog')).getByText('4')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('retains the exact focused target through filtering and delegates focus clearance', () => {
    const clear = vi.fn()
    render(<Integrations records={[first, second]} forcedVisibleId={first.targetId} onClearProgrammaticFocus={clear} />)
    fireEvent.change(screen.getByLabelText('Find a connection'), { target: { value: 'no match' } })
    const row = document.getElementById(first.targetId)
    expect(row?.getAttribute('data-programmatic-focus')).toBe('')
    expect(document.getElementById(second.targetId)).toBeNull()
    if (row === null) throw new Error('Focused connection is missing')
    fireEvent.pointerDown(row)
    expect(clear).toHaveBeenCalledOnce()
  })

  it('inspects current records after readback and closes safely when the selected record disappears', async () => {
    const view = render(<Integrations records={[first, second]} />)
    fireEvent.click(screen.getByRole('button', { name: `Inspect ${first.name}` }))
    const drawer = within(await screen.findByRole('dialog'))
    expect(drawer.getByText('4')).toBeTruthy()
    view.rerender(<Integrations records={[{ ...first, facts: [{ label: 'Authority generation', value: '5' }] }, second]} />)
    expect(drawer.getByText('5')).toBeTruthy()
    expect(drawer.queryByText('4')).toBeNull()
    view.rerender(<Integrations records={[second]} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Connections' })))
  })

  it('returns focus to the connected inspection trigger and keeps row commands outside the drawer', async () => {
    const command = vi.fn()
    render(<Integrations records={[first, { ...second, actions: <button type="button" onClick={() => command(second.id)}>Check second</button> }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check second' }))
    expect(command).toHaveBeenCalledExactlyOnceWith(second.id)
    const trigger = screen.getByRole('button', { name: `Inspect ${first.name}` })
    trigger.focus()
    fireEvent.click(trigger)
    const drawer = within(await screen.findByRole('dialog'))
    expect(drawer.queryByRole('button', { name: 'Check second' })).toBeNull()
    fireEvent.click(drawer.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(command).toHaveBeenCalledOnce()
  })

  it('distinguishes no configured connection from no search results and offers a focused way back', () => {
    const view = render(<Integrations records={[]} emptyAction={<a href="#connect">Connect endpoint</a>} />)
    expect(screen.getByText('No provider connection yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Connect endpoint' }).getAttribute('href')).toBe('#connect')
    view.rerender(<Integrations records={[first]} />)
    fireEvent.change(screen.getByLabelText('Find a connection'), { target: { value: 'missing' } })
    expect(screen.getByText('No connections match this search.')).toBeTruthy()
    expect(screen.queryByText('No provider connection yet')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear connection search' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Find a connection'))
    expect(screen.getByRole('button', { name: `Inspect ${first.name}` })).toBeTruthy()
  })
})
