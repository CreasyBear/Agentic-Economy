/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DirectoryToolPlayground } from '@/components/ae/market/DirectoryToolPlayground'
import { playgroundCallCommand, playgroundSchema, playgroundValidator } from '@/components/ae/market/directory-tool-input'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { query: { type: 'string', minLength: 2, title: 'Search query' }, pathParams: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }, required: ['query', 'pathParams'], additionalProperties: false }
const entry: X402DirectoryEntry = {
  title: 'Search', description: 'Search documents', resource: 'https://example.com/search/:id', provider: 'example.com', protocol: 'http', prices: [], metadataJson: '{}',
  input: { fields: [], schemaJson: JSON.stringify({ type: 'object', properties: { queryParams: { type: 'object' }, headers: { type: 'object' } } }), exampleJson: JSON.stringify({ type: 'http', method: 'GET', queryParams: { query: 'source' }, headers: { 'x-api-version': '2' } }) },
  output: { fields: [], exampleJson: JSON.stringify({ result: 'Published example' }) },
}
const canonical = { inputSchemaJson: JSON.stringify(schema), inputExampleJson: JSON.stringify({ query: 'robots', pathParams: { id: '42' } }), toolRef: 'tool:v1:example' }
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('directory Tool playground', () => {
  it('renders maintained controls and updates the complete canonical command, preserving path inputs', async () => {
    render(<DirectoryToolPlayground entry={entry} {...canonical} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Search query/u }), { target: { value: 'climate' } })
    await waitFor(() => expect(screen.getByText('ae call \'tool:v1:example\' --input \'{"query":"climate","pathParams":{"id":"42"}}\' --json')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /^Run|Submit$/u })).toBeNull()
    expect(screen.getByText('Published sample output. Editing the input does not generate a new result.')).toBeTruthy()
  })
  it('never treats the Provider HTTP wrapper as AE command input', () => {
    render(<DirectoryToolPlayground entry={entry} toolRef="tool:v1:example" />)
    expect(screen.queryByRole('button', { name: 'Copy prepared call command' })).toBeNull()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'JSON' }))
    expect((screen.getByRole('textbox', { name: 'Request JSON' }) as HTMLTextAreaElement).value).toContain('"headers"')
  })
  it('disables command copy for malformed or schema-invalid JSON and restores it after correction', async () => {
    render(<DirectoryToolPlayground entry={entry} {...canonical} />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'JSON' }))
    const input = screen.getByRole('textbox', { name: 'Request JSON' })
    fireEvent.change(input, { target: { value: '{' } })
    expect(screen.queryByRole('button', { name: 'Copy prepared call command' })).toBeNull()
    fireEvent.change(input, { target: { value: '{"query":"x"}' } })
    expect(screen.queryByRole('button', { name: 'Copy prepared call command' })).toBeNull()
    fireEvent.change(input, { target: { value: canonical.inputExampleJson } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy prepared call command' })).toBeTruthy())
  })
  it('keeps referenced schemas editable as JSON and validates references without runtime code compilation', () => {
    const referenceSchema = JSON.stringify({ ...schema, properties: { query: { $ref: '#/$defs/query' } }, required: ['query'], $defs: { query: { type: 'string', minLength: 3 } } })
    const originalFunction = globalThis.Function
    vi.stubGlobal('Function', new Proxy(originalFunction, { construct() { throw new Error('unsafe-eval forbidden') }, apply() { throw new Error('unsafe-eval forbidden') } }))
    try {
      const parsed = playgroundSchema(referenceSchema)!
      expect(playgroundValidator.isValid(parsed, { query: 'yes' }, parsed)).toBe(true)
      expect(playgroundValidator.isValid(parsed, { query: 'no' }, parsed)).toBe(false)
    } finally { vi.unstubAllGlobals() }
    render(<DirectoryToolPlayground entry={entry} toolRef={canonical.toolRef} inputSchemaJson={referenceSchema} inputExampleJson='{"query":"hello"}' />)
    expect((screen.getByRole('tab', { name: 'Form' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('textbox', { name: 'Request JSON' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy prepared call command' })).toBeTruthy()
  })
  it('resets the editor when a different Tool or the canonical contract arrives', () => {
    const view = render(<DirectoryToolPlayground entry={entry} />)
    view.rerender(<DirectoryToolPlayground entry={entry} {...canonical} />)
    expect((screen.getByRole('textbox', { name: /Search query/u }) as HTMLInputElement).value).toBe('robots')
    view.rerender(<DirectoryToolPlayground entry={{ ...entry, resource: 'https://other.example.com' }} {...canonical} inputExampleJson='{"query":"new","pathParams":{"id":"7"}}' />)
    expect((screen.getByRole('textbox', { name: /Search query/u }) as HTMLInputElement).value).toBe('new')
  })
  it('shows honest missing example states and shell-quotes apostrophes and substitutions literally', () => {
    const withoutOutput = { ...entry }
    delete withoutOutput.output
    render(<DirectoryToolPlayground entry={withoutOutput} {...canonical} />)
    expect(screen.getByText('No output example')).toBeTruthy()
    const input = { query: "O'Reilly $(touch nope)", pathParams: { id: '42' } }
    const command = playgroundCallCommand("tool:';$(bad)", playgroundSchema(canonical.inputSchemaJson), JSON.stringify(input))
    expect(command).toBe(`ae call 'tool:'"'"';$(bad)' --input '{"query":"O'"'"'Reilly $(touch nope)","pathParams":{"id":"42"}}' --json`)
  })
  it('requires valid form fields before showing a command and prevents native form submission', async () => {
    render(<DirectoryToolPlayground entry={entry} {...canonical} />)
    const input = screen.getByRole('textbox', { name: /Search query/u })
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.queryByRole('button', { name: 'Copy prepared call command' })).toBeNull()
    fireEvent.change(input, { target: { value: 'complete' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy prepared call command' })).toBeTruthy())
    const event = new Event('submit', { bubbles: true, cancelable: true })
    fireEvent(input.closest('form')!, event)
    expect(event.defaultPrevented).toBe(true)
  })
  it('keeps a canonical typeless request body editable as JSON instead of rendering an unsupported RJSF field', async () => {
    const inputSchemaJson = JSON.stringify({ type: 'object', required: ['body'], properties: { body: { $schema: 'https://json-schema.org/draft/2020-12/schema' } } })
    render(<DirectoryToolPlayground entry={entry} toolRef="tool:v1:exa-search" inputSchemaJson={inputSchemaJson} />)
    expect((screen.getByRole('tab', { name: 'Form' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText(/Unsupported field|Unknown field type/iu)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy prepared call command' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Request JSON' }), { target: { value: '{"body":{"query":"research"}}' } })
    await waitFor(() => expect(screen.getByText('ae call \'tool:v1:exa-search\' --input \'{"body":{"query":"research"}}\' --json')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Copy prepared call command' })).toBeTruthy()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Schema' }))
    const displayedSchema = screen.getByRole('tabpanel', { name: 'Schema' }).querySelector('code')?.textContent
    expect(JSON.parse(displayedSchema!)).toEqual(JSON.parse(inputSchemaJson))
  })
  it('retains form controls when RJSF can infer nested object and enum types', async () => {
    const inputSchemaJson = JSON.stringify({ properties: { body: { properties: { query: { type: ['string', 'null'], title: 'Nested search query' }, mode: { enum: ['web', 'news'] } } } } })
    render(<DirectoryToolPlayground entry={entry} toolRef="tool:v1:inferred" inputSchemaJson={inputSchemaJson} inputExampleJson='{"body":{"query":"research","mode":"web"}}' />)
    expect((screen.getByRole('tab', { name: 'Form' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.change(screen.getByRole('textbox', { name: 'Nested search query' }), { target: { value: 'edited' } })
    await waitFor(() => expect(screen.getByText('ae call \'tool:v1:inferred\' --input \'{"body":{"query":"edited","mode":"web"}}\' --json')).toBeTruthy())
    expect(screen.queryByText(/Unsupported field|Unknown field type/iu)).toBeNull()
  })
  it('switches an already selected Form tab to JSON when refreshed Provider fields cannot render', () => {
    const initialEntry = { ...entry, input: { fields: [], schemaJson: '{"type":"object","properties":{"query":{"type":"string"}}}', exampleJson: '{"query":"keep this input"}' } }
    const view = render(<DirectoryToolPlayground entry={initialEntry} />)
    expect(screen.getByRole('tab', { name: 'Form' }).getAttribute('aria-selected')).toBe('true')
    view.rerender(<DirectoryToolPlayground entry={{ ...initialEntry, input: { ...initialEntry.input, schemaJson: '{"type":"object","properties":{"body":{}}}' } }} />)
    expect(screen.getByRole('tab', { name: 'JSON' }).getAttribute('aria-selected')).toBe('true')
    expect((screen.getByRole('textbox', { name: 'Request JSON' }) as HTMLTextAreaElement).value).toContain('keep this input')
    expect(screen.queryByText(/Unsupported field|Unknown field type/iu)).toBeNull()
  })
})
