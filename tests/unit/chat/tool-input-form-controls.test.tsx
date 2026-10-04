/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeToolInputForm } from '@/components/ae/shared/tool-input-form/AeToolInputForm'
import type { DescriptionFieldProps, RJSFSchema, UiSchema } from '@rjsf/utils'

const schema: RJSFSchema = {
  type: 'object',
  properties: {
    profile: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: 'Name',
          description: 'Name shown to buyers',
          examples: ['Ada'],
        },
        biography: {
          type: 'string',
          title: 'Biography',
          description: 'A short introduction',
        },
      },
    },
    seats: { type: 'integer', title: 'Seats' },
    enabled: { type: 'boolean', title: 'Enabled', description: 'Include this Tool in buyer matching' },
  },
}

const uiSchema: UiSchema = {
  profile: {
    name: { 'ui:help': 'Use your public name' },
    biography: { 'ui:widget': 'textarea', 'ui:options': { rows: 3 } },
  },
}

const initialValue = {
  profile: { name: 'Ada', biography: 'Initial biography' },
  seats: 0,
  enabled: false,
  extra: { retained: true },
}

function StatefulToolInputForm({ onChange }: { onChange: (value: unknown) => void }) {
  const [value, setValue] = useState<unknown>(initialValue)
  return (
    <AeToolInputForm
      idPrefix="tool"
      schema={schema}
      value={value}
      uiSchema={uiSchema}
      onChange={nextValue => {
        onChange(nextValue)
        setValue(nextValue)
      }}
    />
  )
}

function StatefulDescription({ id, description }: DescriptionFieldProps) {
  const [count, setCount] = useState(0)
  return <div id={id}>{description}
    <button type="button" onClick={() => setCount(current => current + 1)}>Review description {count}</button>
  </div>
}

describe('AeToolInputForm generated controls', () => {
  afterEach(() => cleanup())

  it('preserves nested text and textarea identity, controlled updates, and unrelated data', async () => {
    const onChange = vi.fn()
    render(<StatefulToolInputForm onChange={onChange} />)

    const name = await screen.findByLabelText('Name') as HTMLInputElement
    const biography = screen.getByLabelText('Biography') as HTMLTextAreaElement
    expect(name.id).toBe('tool_profile_name')
    expect(name.name).toBe('tool_profile_name')
    expect(name.value).toBe('Ada')
    expect(biography.id).toBe('tool_profile_biography')
    expect(biography.name).toBe('tool_profile_biography')
    expect(biography.value).toBe('Initial biography')
    expect(document.querySelectorAll('label[for="tool_profile_name"]')).toHaveLength(1)
    expect(document.querySelectorAll('label[for="tool_profile_biography"]')).toHaveLength(1)
    expect(biography.getAttribute('aria-describedby')).toContain('tool_profile_biography__description')

    fireEvent.change(name, { target: { value: 'Augusta' } })
    const textUpdate = {
      profile: { name: 'Augusta', biography: 'Initial biography' },
      seats: 0,
      enabled: false,
      extra: { retained: true },
    }
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(textUpdate))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Augusta')

    fireEvent.change(screen.getByLabelText('Biography'), { target: { value: 'A short bio' } })
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({
      ...textUpdate,
      profile: { name: 'Augusta', biography: 'A short bio' },
    }))
    expect((screen.getByLabelText('Biography') as HTMLTextAreaElement).value).toBe('A short bio')
  })

  it('keeps numeric zero visible and emits the existing empty-number result', async () => {
    const onChange = vi.fn()
    render(<StatefulToolInputForm onChange={onChange} />)

    const seats = await screen.findByRole('spinbutton', { name: 'Seats' }) as HTMLInputElement
    expect(seats.id).toBe('tool_seats')
    expect(seats.name).toBe('tool_seats')
    expect(seats.value).toBe('0')

    fireEvent.change(seats, { target: { value: '' } })
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({
      profile: { name: 'Ada', biography: 'Initial biography' },
      enabled: false,
      extra: { retained: true },
    }))
  })

  it('emits a boolean when the checkbox changes and has no submit action', async () => {
    const onChange = vi.fn()
    render(<StatefulToolInputForm onChange={onChange} />)

    const enabled = await screen.findByRole('checkbox', { name: 'Enabled' })
    expect(enabled.id).toBe('tool_enabled')
    const checkboxInput = enabled.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkboxInput.name).toBe('tool_enabled')
    expect(enabled.getAttribute('aria-checked')).toBe('false')
    expect(enabled.getAttribute('aria-describedby')).toContain('tool_enabled__description')
    expect(document.getElementById('tool_enabled__description')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()

    fireEvent.click(enabled)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({
      profile: { name: 'Ada', biography: 'Initial biography' },
      seats: 0,
      enabled: true,
      extra: { retained: true },
    }))
  })

  it('associates descriptions and schema examples with the original field IDs', async () => {
    render(<StatefulToolInputForm onChange={vi.fn()} />)

    const name = await screen.findByLabelText('Name') as HTMLInputElement
    expect(name.getAttribute('aria-describedby')).toContain('tool_profile_name__description')
    expect(name.getAttribute('aria-describedby')).toContain('tool_profile_name__help')
    expect(name.getAttribute('list')).toBe('tool_profile_name__examples')
    expect(document.getElementById('tool_profile_name__examples')).not.toBeNull()
    expect(document.getElementById('tool_profile_name__help')).not.toBeNull()
    expect(screen.getByText('Name shown to buyers')).toBeTruthy()
    expect(screen.getByText('Use your public name')).toBeTruthy()
  })

  it('keeps configured schema defaults and minimum array items conservative', async () => {
    const onChange = vi.fn()
    const defaultsSchema: RJSFSchema = {
      type: 'object',
      properties: {
        region: { type: 'string', title: 'Region', default: 'Sydney' },
        aliases: {
          type: 'array',
          title: 'Aliases',
          minItems: 2,
          items: { type: 'string', title: 'Alias', default: 'Default alias' },
        },
      },
    }

    render(<AeToolInputForm idPrefix="defaults" schema={defaultsSchema} value={{}} onChange={onChange} />)

    const region = await screen.findByLabelText('Region') as HTMLInputElement
    expect(region.value).toBe('')
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('preserves disabled and readonly field states with one associated label each', async () => {
    const onChange = vi.fn()
    const lockedUiSchema: UiSchema = {
      profile: {
        name: { 'ui:disabled': true },
        biography: { 'ui:readonly': true, 'ui:widget': 'textarea' },
      },
      enabled: { 'ui:readonly': true },
    }

    render(
      <AeToolInputForm
        idPrefix="tool"
        schema={schema}
        value={initialValue}
        uiSchema={lockedUiSchema}
        onChange={onChange}
      />,
    )

    const name = await screen.findByLabelText('Name') as HTMLInputElement
    const biography = screen.getByLabelText('Biography') as HTMLTextAreaElement
    const enabled = screen.getByRole('checkbox', { name: 'Enabled' })
    expect(name.disabled).toBe(true)
    expect(name.getAttribute('aria-describedby')).toContain('tool_profile_name__description')
    expect(biography.readOnly).toBe(true)
    expect(enabled.hasAttribute('disabled')).toBe(true)
    expect(document.querySelectorAll('label[for="tool_profile_name"]')).toHaveLength(1)
    expect(document.querySelectorAll('label[for="tool_profile_biography"]')).toHaveLength(1)
    expect(document.querySelectorAll('label[for="tool_enabled"]')).toHaveLength(1)

    fireEvent.click(enabled)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('retains the selected description template identity across checkbox updates', async () => {
    const onChange = vi.fn()
    const describedSchema: RJSFSchema = {
      type: 'object',
      properties: { enabled: { type: 'boolean', title: 'Enabled', description: 'Allow this Tool to run' } },
    }
    const describedUiSchema: UiSchema = { enabled: { 'ui:DescriptionFieldTemplate': StatefulDescription } }
    const { rerender } = render(<AeToolInputForm idPrefix="description" schema={describedSchema}
      value={{ enabled: false }} uiSchema={describedUiSchema} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Review description 0' }))
    const checkbox = screen.getByRole('checkbox', { name: 'Enabled' })
    expect(checkbox.getAttribute('aria-describedby')).toContain('description_enabled__description')
    fireEvent.click(checkbox)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ enabled: true }))
    rerender(<AeToolInputForm idPrefix="description" schema={describedSchema}
      value={{ enabled: true }} uiSchema={describedUiSchema} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Review description 1' })).toBeTruthy()
  })
})
