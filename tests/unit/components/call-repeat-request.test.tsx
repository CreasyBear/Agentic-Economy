/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { spawnSync } from 'node:child_process'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import type { CallReceiptView } from '@/modules/capability-execution/call-receipt-view'
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a href="/tool">{children}</a> }))
import { CallReuseActions } from '@/components/ae/call-receipt/CallReuseActions'
const view: CallReceiptView = { version: 'ae.public-invocation-receipt:v1', callRef: 'call:original', toolRef: 'tool:weather', previousInput: { location: 'Perth' }, statusLabel: 'Complete', statusDetail: 'Done', stages: [], complete: true }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('repeat Call preparation', () => {
  it('carries edited inputs into a fresh-quote handoff without executing anything', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CallReuseActions view={view} />)
    fireEvent.click(screen.getByText('Edit request'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '{"location":"Melbourne"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy request for Agent' }))
    await screen.findByRole('button', { name: 'Request copied' })
    expect(writeText.mock.calls[0]![0]).toContain('{"location":"Melbourne"}')
    expect(writeText.mock.calls[0]![0]).toContain('obtain a fresh Quote')
    expect(writeText.mock.calls[0]![0]).toContain('reuse that key if submission needs retrying')
    expect(view.previousInput).toEqual({ location: 'Perth' })
  })
  it.each(['{', 'null', '[]'])('keeps invalid request editable without an executable example: %s', (input) => {
    render(<CallReuseActions view={view} />)
    fireEvent.click(screen.getByText('Edit request'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: input } })
    expect(screen.getByRole('button', { name: 'Copy request for Agent' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a JSON object')
    expect(screen.queryByText('Technical ways to reuse')).toBeNull()
  })
  it('copied shell request preserves quotes, substitutions, newlines and literal ORIGIN in input', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const input = { text: "O'Brien $(printf EXPANDED) `printf WRONG` $ORIGIN\nnext" }
    render(<CallReuseActions view={{ ...view, previousInput: input }} />)
    fireEvent.click(screen.getByText('Technical ways to reuse'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy API request' }))
    await screen.findByRole('button', { name: 'API request copied' })
    const copied = writeText.mock.calls[0]![0]
    // Stub curl in the shell: this checks actual argv parsing without networking.
    const parsed = spawnSync('/bin/sh', ['-c', 'curl() { printf "%s\\n" "$@"; }; ' + copied], { encoding: 'utf8', env: { AE_API_KEY: 'test-key' } })
    expect(parsed.status).toBe(0)
    const args = parsed.stdout.trim().split('\n')
    expect(args[1]).toBe(`${window.location.origin}/api/v1/tools/call`)
    expect(args).not.toContain('+')
    expect(JSON.parse(args[args.indexOf('--data') + 1]!).input).toEqual(input)
  })
})
