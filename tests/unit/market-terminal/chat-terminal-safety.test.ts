import { describe, expect, it } from 'vitest'
import { shellArgument } from '../../../tools/ae/lib/continuation-command'
import { sanitizeText } from '../../../tools/ae/lib/output'

describe('CLI terminal safety', () => {
  it('quotes a command-substitution origin so a shell cannot expand it', () => {
    expect(shellArgument('https://$(touch x).example')).toBe("'https://$(touch x).example'")
  })

  it('strips escape sequences from remote chat text', () => {
    expect(sanitizeText('hi\u001b]0;pwned\u0007 there')).not.toContain('\u001b')
  })
})
