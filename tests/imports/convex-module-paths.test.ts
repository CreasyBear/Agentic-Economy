import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'
import { scanConvexApiSurfaceFromSources } from '../helpers/convex-rpc-contract-scans'

describe('Convex module paths', () => {
  it('uses only characters accepted by Convex', () => {
    const invalid = findFiles([{ root: 'convex', includeExtensions: ['.ts'] }])
      .filter((path) => !path.startsWith('convex/_generated/'))
      .filter((path) => !/^[A-Za-z0-9_./]+$/.test(path))

    expect(invalid).toEqual([])
  })

  it('keeps registrations out of filenames the Convex bundler skips', () => {
    // Convex skips a filename with more than one dot, including *.actions.ts.
    // Tests and other non-registration files may retain their role suffixes.
    const skipped = scanConvexApiSurfaceFromSources()
      .filter(({ module }) => module.split('/').at(-1)?.includes('.'))

    expect(skipped).toEqual([])
  })
})
