import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()
const mapPath = '.planning/codebase/PROMPT-DATA-FLOW.md'
const mapFile = resolve(root, mapPath)
const map = existsSync(mapFile) ? readFileSync(mapFile, 'utf8') : ''

function lines(relativePath: string): number {
  return readFileSync(resolve(root, relativePath), 'utf8').split('\n').length
}

describe('prompt and data-flow architecture map', () => {
  it('keeps every mapped flow explicit and durable', () => {
    expect(existsSync(mapFile), mapPath).toBe(true)
    expect(map).not.toContain('history://')
    expect(map.match(/^## Flow [A-C] —/gm)).toHaveLength(3)

    for (const section of [
      '## Maintenance contract and evidence ceiling',
      '## Functional block diagrams',
      '## Current callsite inventory',
      '## Resource-first USE checklist',
      '## Invariants, reachable gaps, and proof ceilings',
      '## Primary source register',
    ]) {
      expect(map, section).toContain(section)
    }

    for (const id of ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3']) {
      expect(map, id).toContain(`### ${id}.`)
    }
  })

  it('keeps every local source citation resolvable at its recorded line anchors', () => {
    const citation = /`((?:src|convex|eval|tests|node_modules)\/[^`:\s]+|package\.json):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)`/g
    const matches = [...map.matchAll(citation)]

    expect(matches.length).toBeGreaterThan(0)
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

    expect(architecture).toContain('[`PROMPT-DATA-FLOW.md`](PROMPT-DATA-FLOW.md)')
    expect(architecture).toContain('MUST update it')
  })
})
