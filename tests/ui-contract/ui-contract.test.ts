import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { scanUiContract, type ScanTarget } from '@/lib/ui/contract-scans'

const productUiTargets: readonly ScanTarget[] = [
  { root: 'src/components/ae', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/routes', includeExtensions: ['.ts', '.tsx'] },
]

describe('AE UI contract', () => {
  it('keeps product routes and AE components on semantic visual tokens', () => {
    expect(scanUiContract(productUiTargets)).toEqual([])
  })

  it('keeps shared shell primitives on the system motion and surface language', () => {
    const primitiveFiles = [
      'src/components/ui/dialog.tsx',
      'src/components/ui/sheet.tsx',
      'src/components/ui/sidebar.tsx',
    ]
    const primitiveSource = primitiveFiles
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')

    expect(primitiveSource).not.toContain('transition-all')
    expect(primitiveSource).not.toMatch(/bg-black\/\d+/)
    expect(primitiveSource).not.toMatch(/shadow-(?:sm|md|lg|xl|2xl)\b/)
    expect(primitiveSource).toContain('duration-base')
    expect(primitiveSource).toContain('ease-emphasized')
    expect(primitiveSource).toContain('shadow-overlay')
    expect(primitiveSource).toContain('active:scale-[0.96]')
  })
})
