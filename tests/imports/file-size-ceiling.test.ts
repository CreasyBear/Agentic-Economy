import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import emailcn from '../../src/emails/vendor/emailcn/upstream-manifest.json'
import reui from '../../src/components/reui/upstream-manifest.json'
import { relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

const MAX_LINES = 1000

describe('file size ceiling', () => {
  it('pins the exact upstream source allowed to retain vendor structure', () => {
    const names = reui.files.map(entry => entry.path)
    expect(new Set(names).size).toBe(names.length)
    for (const entry of reui.files) {
      expect(entry.path).toMatch(/^src\/components\/(reui\/|ui\/sidebar\.tsx$)/)
      expect(createHash('sha256').update(readFileSync(entry.path)).digest('hex'), entry.path).toBe(entry.sha256)
      expect(entry.upstreamSha256).toMatch(/^[a-f0-9]{64}$/)
    }
    expect(reui.files.filter(entry => entry.allowLargeSource).map(entry => entry.path).sort()).toEqual([
      'src/components/reui/data-grid/data-grid-table.tsx',
      'src/components/reui/data-grid/data-grid.tsx',
    ])
  })
  it('pins the vendored emailcn source', () => {
    for (const entry of emailcn.files) {
      expect(entry.path).toMatch(/^src\/emails\/vendor\/emailcn\//)
      expect(createHash('sha256').update(readFileSync(entry.path)).digest('hex'), entry.path).toBe(entry.sha256)
      expect(entry.upstreamSha256).toMatch(/^[a-f0-9]{64}$/)
    }
  })
  it('keeps maintained source files at or under 1,000 lines', () => {
    const offenders = findFiles([
      { root: 'src', includeExtensions: ['.ts', '.tsx'] },
      { root: 'convex', includeExtensions: ['.ts'] },
    ])
      .filter(
        (file) =>
          !file.includes('_generated') &&
          !file.includes('.test.') &&
          !file.includes('routeTree.gen.ts') &&
          !file.endsWith('convex/devSeed.ts'),
      )
      .map((file) => ({
        file: relative(process.cwd(), file).split(sep).join('/'),
        lines: readFileSync(file, 'utf8').split('\n').length,
      }))
      .filter(({ file, lines }) => lines > MAX_LINES && !reui.files.some(entry => entry.path === file && entry.allowLargeSource))
      .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file))

    expect(
      offenders,
      `Files may not exceed ${MAX_LINES} lines:\n${offenders
        .map(({ file, lines }) => `  ${lines}  ${file}`)
        .join('\n')}`,
    ).toEqual([])
  })
})
