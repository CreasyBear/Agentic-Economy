import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'

import {
  findFiles,
  type ScanTarget,
  type ScanViolation,
} from './file-discovery'

export type ConvexFacadeFile = Readonly<{
  file: string
  lines: number
}>

export type ConvexFacadeSizeScanResult = Readonly<{
  files: readonly ConvexFacadeFile[]
  violations: readonly ScanViolation[]
}>

export function scanConvexFacadeSizes(
  targets: readonly ScanTarget[],
  maxLines: number,
): ConvexFacadeSizeScanResult {
  const filesByPath = new Map<string, ConvexFacadeFile>()

  for (const target of targets) {
    for (const file of findFiles([target])) {
      if (!isEligibleDepthOneFile(file, target.root)) continue

      const contents = readFileSync(file, 'utf8')
      const normalizedFile = relative(process.cwd(), file).split(sep).join('/')
      filesByPath.set(normalizedFile, {
        file: normalizedFile,
        lines: contents.split('\n').length,
      })
    }
  }

  const files = [...filesByPath.values()].sort((left, right) =>
    left.file.localeCompare(right.file),
  )

  return {
    files,
    violations: files
      .filter(({ lines }) => lines > maxLines)
      .map(({ file, lines }) => ({
        file,
        line: 1,
        rule: 'convex-facade-size',
        message: `${file} has ${lines} lines; Convex root maximum is ${maxLines}`,
        excerpt: `${lines} lines`,
      })),
  }
}

function isEligibleDepthOneFile(file: string, root: string): boolean {
  const relativeToRoot = relative(root, file).split(sep).join('/')

  // Generated modules live below _generated/; depth-one excludes that category.
  // Test files are fixtures, not maintained Convex roots.
  return (
    relativeToRoot !== '' &&
    !relativeToRoot.includes('/') &&
    !file.split(sep).includes('_generated') &&
    !/\.test\.tsx?$/.test(file)
  )
}
