import { describe, expect, it } from 'vitest'

import { sanitizeText } from '../../tools/ae/lib/output'

describe('ae output sanitizer', () => {
  it('strips ESC, CSI and other controls but keeps newline and tab', () => {
    const out = sanitizeText('Evil\u001b[2J\u009b31m\u0007 tool\tname\nnext')
    expect(out).toBe('Evil[2J31m tool\tname\nnext')
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u)
  })
  it('strips bidi controls', () => {
    expect(sanitizeText('a\u202eb\u2066c\u2069d')).toBe('abcd')
  })
})
