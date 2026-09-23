import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'

import {
  findFiles,
  type ScanTarget,
  type ScanViolation,
} from './file-discovery'

export type FileSizeBucket = 'over300' | 'over500' | 'over1000'

export type FileSizeEntry = Readonly<{
  file: string
  lines: number
}>

export type FileSizeScanResult = Readonly<{
  counts: Readonly<Record<FileSizeBucket, number>>
  files: readonly FileSizeEntry[]
  violations: readonly ScanViolation[]
}>

export function scanFileSizes(
  targets: readonly ScanTarget[],
): FileSizeScanResult {
  const files = findFiles(targets)
    .filter(
      (file) =>
        !file.includes('_generated') &&
        !file.includes('.test.') &&
        !file.includes('routeTree.gen.ts'),
    )
    .map((file) => ({
      file: relative(process.cwd(), file).split(sep).join('/'),
      lines: readFileSync(file, 'utf8').split('\n').length,
    }))
    .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file))

  const counts = { over300: 0, over500: 0, over1000: 0 }
  for (const { lines } of files) {
    if (lines > 300) counts.over300 += 1
    if (lines > 500) counts.over500 += 1
    if (lines > 1000) counts.over1000 += 1
  }

  return {
    counts,
    files,
    violations: files
      .filter(({ lines }) => lines > 300)
      .map(({ file, lines }) => ({
        file,
        line: 1,
        rule: 'file-size-over-300',
        message: `${file} has ${lines} lines`,
        excerpt: `${lines} lines`,
      })),
  }
}
