import { readFileSync } from 'node:fs'

import { findFiles, type ScanTarget, type ScanViolation } from './file-discovery'

const EXPORTED_TYPE_PATTERN = /^export\s+(type|interface)\s+(\w+)/gm

export function scanTsxTypeQuarantine(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  const violations: ScanViolation[] = []

  for (const file of findFiles(targets)) {
    if (file.includes('.test.')) continue

    const contents = readFileSync(file, 'utf8')
    for (const match of contents.matchAll(EXPORTED_TYPE_PATTERN)) {
      const name = match[2]
      if (name === undefined || name.endsWith('Props')) continue

      const line = contents.slice(0, match.index).split('\n').length
      violations.push({
        file: file.replaceAll('\\', '/'),
        line,
        rule: 'tsx-type-quarantine',
        message: name,
        excerpt: contents.split('\n')[line - 1] ?? '',
      })
    }
  }

  return violations
}
