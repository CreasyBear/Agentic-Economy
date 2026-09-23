import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'

import { findFiles, type ScanTarget, type ScanViolation } from './file-discovery'

const IMPORT_SPECIFIER_PATTERN =
  /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

export function scanLeafPurity(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  const violations: ScanViolation[] = []

  for (const file of findFiles(targets)) {
    const normalizedFile = relative(process.cwd(), file).split(sep).join('/')
    const outsideLeafTargets =
      normalizedFile.startsWith('src/components/') &&
      !normalizedFile.startsWith('src/components/ui/') &&
      !normalizedFile.startsWith('src/components/ae/shared/') &&
      !/^src\/components\/ae\/.+\/components\/.+\.tsx$/.test(normalizedFile)
    if (normalizedFile.includes('.test.') || outsideLeafTargets) continue

    const contents = readFileSync(file, 'utf8')
    for (const match of contents.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1] ?? match[2]
      if (
        specifier === undefined ||
        (specifier !== 'convex/react' &&
          specifier !== '@tanstack/react-start' &&
          !specifier.endsWith('/_generated/api'))
      ) {
        continue
      }

      const specifierOffset = match.index + match[0].indexOf(specifier)
      violations.push({
        file: normalizedFile,
        line: contents.slice(0, specifierOffset).split('\n').length,
        rule: 'leaf-purity-forbidden-import',
        message: `Leaf component imports ${specifier}; move data access to its container or hook.`,
        excerpt: specifier,
      })
    }
  }

  return violations
}

