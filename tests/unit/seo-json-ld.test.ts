import { describe, expect, it } from 'vitest'

import { serializeJsonLd } from '@/modules/seo/public'

describe('serializeJsonLd', () => {
  it('escapes script-breaking owner text', () => {
    const serialized = serializeJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: 'Pipe <script>alert(1)</script> & Sons',
      },
    ])

    expect(serialized).toContain('\\u003cscript')
    expect(serialized).toContain('\\u0026')
    expect(serialized).not.toContain('<script>')
  })
})
