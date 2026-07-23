import { describe, expect, it } from 'vitest'

import {
  parseComparisonUrlState,
  comparisonSelectionId,
  serializeComparisonUrlState,
  type ComparisonSelectionRef,
} from '@/modules/comparison/public'

const selection = (
  suffix: string,
  overrides: Partial<ComparisonSelectionRef> = {},
): ComparisonSelectionRef => ({
  businessId: `business:${suffix}`,
  offeringRef: `offering:${suffix}`,
  offeringRevision: 1,
  projectionObservedAt: 100,
  ...overrides,
})

describe('offering-comparison:v1 URL contract', () => {
  it('round-trips only bounded exact references and closed priority IDs', () => {
    const encoded = serializeComparisonUrlState({
      selections: [selection('one'), selection('two', { offeringRevision: 2 })],
      priorities: ['professional_service:v1:lowest_total_price'],
    })

    expect(parseComparisonUrlState(encoded)).toEqual({
      kind: 'accepted',
      state: {
        version: 'offering-comparison:v1',
        selections: [selection('one'), selection('two', { offeringRevision: 2 })],
        priorities: ['professional_service:v1:lowest_total_price'],
      },
    })
    expect(decodeURIComponent(encoded)).not.toMatch(
      /businessName|offeringName|summary|amountMinor|currency|sourceHash|session|authToken|customer/i,
    )
  })

  it.each([
    ['malformed selection', '?selection=not-json'],
    ['duplicate selection', query([selection('one'), selection('one')], [])],
    ['fifth selection', query(
      [selection('1'), selection('2'), selection('3'), selection('4'), selection('5')],
      [],
    )],
    ['fourth priority', query([selection('one')], [
      'professional_service:v1:lowest_total_price',
      'machine_data:v1:lowest_request_price',
      'professional_service:v1:lowest_total_price',
      'machine_data:v1:lowest_request_price',
    ])],
    ['unknown priority', query([selection('one')], ['reputation:highest'])],
    ['non-positive revision', query([selection('one', { offeringRevision: 0 })], [])],
    ['oversized business ID', query([selection('one', { businessId: `b:${'x'.repeat(299)}` })], [])],
    ['oversized Offering ref', query([selection('one', { offeringRef: `o:${'x'.repeat(299)}` })], [])],
    ['unexpected free text', `${query([selection('one')], [])}&query=cheap+and+local`],
  ])('returns a bounded ordinary refusal for %s', (_label, encoded) => {
    expect(parseComparisonUrlState(encoded)).toMatchObject({ kind: 'refused' })
  })

  it('canonicalizes parameter order without reordering selections or priorities', () => {
    const state = {
      selections: [selection('two'), selection('one')],
      priorities: [
        'machine_data:v1:lowest_request_price',
        'professional_service:v1:lowest_total_price',
      ],
    } as const

    const first = serializeComparisonUrlState(state)
    const parsed = parseComparisonUrlState(first)
    expect(parsed.kind).toBe('accepted')
    if (parsed.kind !== 'accepted') return
    expect(serializeComparisonUrlState(parsed.state)).toBe(first)
    expect(parsed.state.selections.map((item) => item.businessId)).toEqual([
      'business:two',
      'business:one',
    ])
  })

  it('uses collision-free tuple IDs for adversarial colon-bearing references', () => {
    const left = selection('left', {
      businessId: 'business:a:b',
      offeringRef: 'offering:c',
    })
    const right = selection('right', {
      businessId: 'business:a',
      offeringRef: 'b:offering:c',
    })

    expect(comparisonSelectionId(left)).not.toBe(comparisonSelectionId(right))
  })

  it('keeps hostile lone-surrogate URL input and tuple IDs total', () => {
    const hostile = selection('hostile', { businessId: 'business:\ud800' })
    const encoded = query([hostile], [])

    expect(() => parseComparisonUrlState(encoded)).not.toThrow()
    expect(() => comparisonSelectionId(hostile)).not.toThrow()
  })
})

function query(
  selections: readonly ComparisonSelectionRef[],
  priorities: readonly string[],
): string {
  const params = new URLSearchParams()
  for (const item of selections) params.append('selection', JSON.stringify(item))
  for (const priority of priorities) params.append('priority', priority)
  return `?${params.toString()}`
}
