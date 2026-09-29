import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

const MAX_LINES = 1000

describe('file size ceiling', () => {
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
      .filter(({ lines }) => lines > MAX_LINES)
      .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file))

    expect(
      offenders,
      `Files may not exceed ${MAX_LINES} lines:\n${offenders
        .map(({ file, lines }) => `  ${lines}  ${file}`)
        .join('\n')}`,
    ).toEqual([])
  })
})
