// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useMarketCompare } from '@/components/ae/market/compare/useMarketCompare'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const resource = 'https://example.test/weather'
const entry: X402DirectoryEntry = { resource, title: 'Weather', description: 'Forecast', provider: 'example.test', prices: [], protocol: 'x402', metadataJson: '{}' }
afterEach(cleanup)
describe('comparison continuity across result sources', () => {
  it('keeps a canonical descriptor after the browse page changes and counts each exact Tool once', () => {
    const tool = { toolRef } as PublicToolDescriptor
    const { result } = renderHook(() => useMarketCompare({ compare: `${toolRef},${resource}`, loadedEntries: [], resolvedEntries: [{ resource: toolRef, tool }, { resource, tool }] }))
    expect(result.current.availableTools).toEqual([tool])
    expect(result.current.selections).toHaveLength(2)
  })
  it('does not revive a missing admitted selection from a stale browse card', () => {
    const { result } = renderHook(() => useMarketCompare({ compare: toolRef, loadedEntries: [{ ...entry, choice: { access: 'ae_callable', toolRef } }], resolvedEntries: [{ resource: toolRef, missing: true }] }))
    expect(result.current.availableTools).toEqual([])
    expect(result.current.availableEntries).toEqual([])
    expect(result.current.selections[0]).toEqual({ resource: toolRef, missing: true })
  })
  it('compares each exact external listing once when search and Saved carry different references to it', () => {
    const id = `registry:${'b'.repeat(64)}`
    const { result } = renderHook(() => useMarketCompare({ compare: `${id},${resource}`, loadedEntries: [], resolvedEntries: [{ resource: id, entry }, { resource, entry }] }))
    expect(result.current.availableEntries).toEqual([entry])
  })
})
