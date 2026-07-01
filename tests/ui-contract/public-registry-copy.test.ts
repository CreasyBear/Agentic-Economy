import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('public registry copy contract', () => {
  it('keeps registry copy in customer-facing business-detail language', () => {
    const route = readFileSync('src/routes/registry.tsx', 'utf8')
    const searchPanel = readFileSync('src/components/ae/forms/AeRegistrySearchPanel.tsx', 'utf8')
    const card = readFileSync('src/components/ae/registry/AeRegistryCard.tsx', 'utf8')

    expect(route).toContain('Find business details companies can stand behind.')
    expect(searchPanel).toContain('Business, service, or place')
    expect(route).toContain('No matching business yet')
    expect(route).toContain('Claim your business page')
    expect(card).toContain('Published details')
    expect(card).toContain('Service area')
    expect(card).toContain('Response')
    expect(card).toContain('Best next step:')

    expect(route).not.toContain('Read source-owned answer records.')
    expect(route).not.toContain('Claim your answer record')
    expect(route).not.toContain('Public data readback')
    expect(route).not.toContain('Find public service pages')
    expect(route).not.toContain('Registry search')
    expect(route).not.toContain('No registry results')
    expect(route).not.toContain('Open page')
  })
})
