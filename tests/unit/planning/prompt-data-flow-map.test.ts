import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()
const mapPath = '.planning/codebase/PROMPT-DATA-FLOW.md'
const map = readFileSync(resolve(root, mapPath), 'utf8')

function lines(relativePath: string): number {
  return readFileSync(resolve(root, relativePath), 'utf8').split('\n').length
}

describe('prompt and data-flow architecture map', () => {
  it('keeps every mapped flow explicit and durable', () => {
    expect(map).not.toContain('history://')
    expect(map.match(/^## Flow [A-C] —/gm)).toHaveLength(3)
    expect(map.match(/\| stage \| source evidence \| input \| processing \| output \| owner \|/g))
      .toHaveLength(3)
    expect(map).toContain('## Maintenance contract')

    for (const id of [
      'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9',
      'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
      'C1', 'C2', 'C3', 'C4',
    ]) {
      expect(map).toContain(`| ${id} |`)
    }
  })

  it('keeps every local source citation resolvable at its recorded line anchors', () => {
    const citation = /`((?:src|convex|eval|tests|node_modules)\/[^`:\s]+|package\.json):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)`/g
    const matches = [...map.matchAll(citation)]

    expect(matches.length).toBeGreaterThan(80)
    for (const match of matches) {
      const relativePath = match[1]!
      const anchors = match[2]!
      expect(existsSync(resolve(root, relativePath)), relativePath).toBe(true)
      const lineCount = lines(relativePath)
      for (const anchor of anchors.split(',')) {
        const [startText, endText] = anchor.split('-')
        const start = Number(startText)
        const end = Number(endText ?? startText)
        expect(start, `${relativePath}:${anchor}`).toBeGreaterThan(0)
        expect(end, `${relativePath}:${anchor}`).toBeGreaterThanOrEqual(start)
        expect(end, `${relativePath}:${anchor}`).toBeLessThanOrEqual(lineCount)
      }
    }
  })

  it('keeps the primary architecture map linked with its update rule', () => {
    const architecture = readFileSync(resolve(root, '.planning/codebase/ARCHITECTURE.md'), 'utf8')

    expect(architecture).toContain('[PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md)')
    expect(architecture).toContain('MUST update it')
  })
})
