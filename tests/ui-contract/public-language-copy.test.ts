import { describe, expect, it } from 'vitest'

import { scanPublicLanguage } from '@/lib/ui/contract-scans'

const publicLanguageTargets = [
  { root: 'src/routes/index.tsx', includeExtensions: ['.tsx'] },
  { root: 'src/routes/q.$answerId.tsx', includeExtensions: ['.tsx'] },
  { root: 'src/routes/registry.tsx', includeExtensions: ['.tsx'] },
  { root: 'src/routes/$slug.tsx', includeExtensions: ['.tsx'] },
  { root: 'src/routes/claim.tsx', includeExtensions: ['.tsx'] },
  { root: 'src/routes/claim.success.tsx', includeExtensions: ['.tsx'] },
  { root: 'src/routes/privacy.remove-business.tsx', includeExtensions: ['.tsx'] },
  { root: 'src/components/ae/chat', includeExtensions: ['.tsx'] },
  { root: 'src/components/ae/landing', includeExtensions: ['.tsx'] },
  { root: 'src/components/ae/listing', includeExtensions: ['.tsx'] },
  { root: 'src/components/ae/layout/AePublicShell.tsx', includeExtensions: ['.tsx'] },
] as const

describe('public language copy contract', () => {
  it('keeps public surfaces in outcome-facing language without internal or money-rail drift', () => {
    expect(scanPublicLanguage(publicLanguageTargets)).toEqual([])
  })
})
