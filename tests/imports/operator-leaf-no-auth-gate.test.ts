import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function findOperatorLeafFiles(): string[] {
  const output = execSync(
    'find src/routes/_operator -type f \\( -name "*.tsx" -o -name "*.ts" \\) | sort',
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    },
  ).trim()
  return output.length === 0 ? [] : output.split('\n')
}

function fileText(relativePath: string): string {
  return readFileSync(resolve(PROJECT_ROOT, relativePath), 'utf8')
}

describe('operator layout route authentication guard', () => {
  it('keeps the auth gate in the parent layout, not in leaf routes', () => {
    const leafFiles = findOperatorLeafFiles()
    // Sanity-check the fixture itself: if this drops to zero, the scan
    // target changed shape and the assertion below would pass vacuously.
    expect(leafFiles.length).toBeGreaterThan(0)

    const parentLayoutFile = 'src/routes/_operator.tsx'
    const parentText = fileText(parentLayoutFile)

    // Parent layout MUST contain operatorLayoutRouteOptions
    expect(parentText, `Auth gate must be in ${parentLayoutFile} via operatorLayoutRouteOptions`).toContain(
      'operatorLayoutRouteOptions',
    )

    // Leaf routes must NOT have their own auth gates
    const leafViolations = leafFiles
      .map((leafPath) => {
        const text = fileText(leafPath)
        const violations: string[] = []

        if (text.includes('requireOperatorBeforeLoad')) {
          violations.push(`contains requireOperatorBeforeLoad`)
        }
        if (text.includes('admitOperatorSessionServer') || text.includes('operatorLayoutRouteOptions')) {
          violations.push(`declares its own operator auth gate; redirects in beforeLoad are fine, admission belongs to src/routes/_operator.tsx`)
        }

        return violations.length > 0 ? { leafPath, violations } : null
      })
      .filter((v): v is { leafPath: string; violations: string[] } => v !== null)

    const violationMessage =
        leafViolations.length === 0
          ? ''
          : `Leaf route auth gates found (should be in ${parentLayoutFile}):\n${leafViolations
              .map((v) => `  ${v.leafPath}: ${v.violations.join(', ')}`)
              .join('\n')}`
    expect(leafViolations, violationMessage).toEqual([])
  })
})
