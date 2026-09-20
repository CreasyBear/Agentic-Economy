import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  convexApiTripleKey,
  formatTripleDiff,
  scanConvexApiSurfaceFromSources,
  scannedModulesMissingFromGeneratedApi,
  sortTriples,
  type ConvexApiTriple,
} from '../helpers/convex-rpc-contract-scans'

/**
 * Guard 1 — generated Convex API kind snapshot.
 *
 * Surface derivation: walk convex TypeScript sources (excluding _generated and convex test files)
 * for `export const <name> = query|mutation|action|internal*` registrations,
 * including `*Generic` builder aliases. Module ids match `convex/_generated/api.d.ts`
 * `fullApi` paths (file path relative to `convex/` without extension).
 *
 * We do not diff `api.d.ts` exports directly because that file carries module
 * types only; per-function kinds live in registration calls. `api.js` is `anyApi`
 * and has no runtime kind metadata.
 *
 * Updating `tests/fixtures/convex-api-kind-snapshot.json` is only correct after
 * every string-literal Convex reference (`makeFunctionReference`, `sourceQuery`,
 * `sourceMutation`, `sourceAction`, and siblings) has been updated to the new
 * module/method/kind. Regenerate with:
 *
 *   NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node --import tsx -e "
 *   import { writeFileSync } from 'node:fs';
 *   import { scanConvexApiSurfaceFromSources } from './tests/helpers/convex-rpc-contract-scans.ts';
 *   writeFileSync('tests/fixtures/convex-api-kind-snapshot.json',
 *     JSON.stringify(scanConvexApiSurfaceFromSources(), null, 2) + '\\n');"
 */
const FIXTURE_PATH = 'tests/fixtures/convex-api-kind-snapshot.json'

function readFixture(): ConvexApiTriple[] {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as ConvexApiTriple[]
}

describe('convex api kind snapshot', () => {
  it('matches the committed module.method kind baseline', () => {
    const actual = scanConvexApiSurfaceFromSources()
    const expected = readFixture()

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Convex API kind snapshot drifted. Update ${FIXTURE_PATH} only after string-literal call sites are migrated.\n${formatTripleDiff(expected, actual)}`,
      )
    }

    expect(actual.map(convexApiTripleKey)).toEqual(sortTriples(expected).map(convexApiTripleKey))
  })

  it('reports scanned modules that are absent from generated fullApi (informational)', () => {
    const missing = scannedModulesMissingFromGeneratedApi(scanConvexApiSurfaceFromSources())
    expect(missing).toEqual(['moneyPayoutPolicy'])
  })
})
