import { describe, expect, it } from 'vitest'
import {
  adminInvestigationSearchSchema, adminInvestigationReturnHref, adminInvestigationReturnSearch, withAdminInvestigationReturn,
} from '@/components/ae/admin/exceptions/admin-investigation-return'

describe('admin investigation return context', () => {
  it('round trips kind, partition, loaded window, exact reference and row focus', () => {
    const source = { kind: 'source_authority_review' as const, partition: 'unset' as const, loaded: 150 }
    const row = { ref: 'publication:1', id: 'source_authority_review:publication:1' }
    const href = withAdminInvestigationReturn('/admin/tools/publication%3A1', source, row)
    const scope = adminInvestigationSearchSchema.parse(Object.fromEntries(new URL(href, 'https://ae.test').searchParams))
    expect(adminInvestigationReturnSearch(scope)).toEqual({ ...source, ref: row.ref, focus: row.id })
    expect(adminInvestigationReturnHref(scope)).toBe('/admin/exceptions?kind=source_authority_review&partition=unset&loaded=150&ref=publication%3A1&focus=source_authority_review%3Apublication%3A1')
  })
  it('uses the fixed source destination and rejects external redirects and invalid windows', () => {
    const scope = adminInvestigationSearchSchema.parse({ returnTo: 'https://evil.test', returnKind: 'removal_dispute', returnPartition: 'unset', returnLoaded: 10000, returnFocus: 'x'.repeat(351) })
    expect(adminInvestigationReturnHref(scope)).toBe('/admin/exceptions?kind=removal_dispute&partition=opened')
    expect(withAdminInvestigationReturn('https://evil.test/admin/tools/1', {}, { ref: 'x', id: 'x' })).toBe('https://evil.test/admin/tools/1')
  })
})
