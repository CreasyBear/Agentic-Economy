import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

const registration =
  /export const\s+(\w+)\s*=\s*(internalQuery|internalMutation|internalAction|query|mutation|action)\s*\(/g

function registrationBody(source: string, openParen: number): string {
  let depth = 0
  for (let index = openParen; index < source.length; index += 1) {
    const character = source[index]
    if (character === '(') depth += 1
    if (character === ')') {
      depth -= 1
      if (depth === 0) return source.slice(openParen, index + 1)
    }
  }
  return source.slice(openParen)
}

describe('Convex registration returns', () => {
  it('declares returns on every query, mutation, and action', () => {
    const missing: string[] = []
    for (const file of findFiles([{ root: 'convex', includeExtensions: ['.ts'] }])) {
      if (file.includes('_generated') || file.includes('.test.')) continue
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(registration)) {
        const openParen = (match.index ?? 0) + match[0].length - 1
        if (!/\breturns\s*:/.test(registrationBody(source, openParen))) {
          const path = relative(process.cwd(), file).split(sep).join('/')
          missing.push(`${path}:${match[1] ?? 'unknown'}`)
        }
      }
    }

    expect(missing, `Registrations missing returns:\n${missing.join('\n')}`).toEqual([])
  })
})
