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
})
