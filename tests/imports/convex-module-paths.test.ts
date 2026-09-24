import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

describe('Convex module paths', () => {
  it('uses only characters accepted by Convex', () => {
    const invalid = findFiles([{ root: 'convex', includeExtensions: ['.ts'] }])
      .filter((path) => !path.startsWith('convex/_generated/'))
      .filter((path) => !/^[A-Za-z0-9_./]+$/.test(path))

    expect(invalid).toEqual([])
  })
})
