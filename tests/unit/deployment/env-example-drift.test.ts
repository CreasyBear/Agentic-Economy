import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  ENV_EXAMPLE_PATH,
  computeUnclassifiedNames,
  loadConvexEnvNames,
  loadManifestInput,
  renderEnvExample,
} from '../../../tools/release/render-env-example'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// Reads the working-tree `.env.example` (the file `render-env-example.ts` writes). Some sandbox
// configurations deny direct tool-level reads of `.env*` paths, but a plain node `fs` read from
// inside the vitest process is unaffected -- confirmed by running this same read via `tsx -e`
// during development. If a sandbox ever does deny it here, fall back to the last committed blob
// via `git show`, which reads through git rather than the filesystem permission layer.
function readCurrentEnvExample(): string {
  try {
    return readFileSync(ENV_EXAMPLE_PATH, 'utf8')
  } catch {
    return execFileSync('git', ['show', 'HEAD:.env.example'], { cwd: REPO_ROOT, encoding: 'utf8' })
  }
}

// Present today (see step 3/4 of the render-env-example task): these names appear in the
// committed .env.example but are declared in neither src/lib/deployment/manifest.ts nor
// convex/convex.config.ts. Removing a name from this list without also removing it from
// .env.example (or vice versa) is a deliberate edit, not silent drift.
// TODO(Well 3 follow-up): classify or delete.
const EXPECTED_UNCLASSIFIED_NAMES: readonly string[] = [
  'AE_AUTHENTICATED_E2E_BASE_URL',
  'AE_CUSTOMER_REQUEST_JOURNEY_PREVIOUS_PUBLIC_KEYS',
  'AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY',
  'AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC',
  'AE_E2E_OWNER_EMAIL',
  'AE_GATEWAY_SMOKE_APPROVED_AT',
  'AE_GATEWAY_SMOKE_OUTPUT_PATH',
  'AE_GATEWAY_SMOKE_OWNER_BUSINESS_ID',
  'AE_GATEWAY_SMOKE_OWNER_BUSINESS_NAME',
  'AE_GATEWAY_SMOKE_PAYOUT_IDEMPOTENCY_KEY',
  'AE_GATEWAY_SMOKE_PAYOUT_REF',
  'AE_GATEWAY_SMOKE_TOPUP_PREPARATION_PATH',
  'AE_GATEWAY_SMOKE_TOPUP_STAGE',
  'AE_GOVERNED_SEND_INTEGRITY_KEY_ID',
  'AE_GOVERNED_SEND_INTEGRITY_SECRET',
  'AE_GOVERNED_SEND_INTEGRITY_VERIFICATION_KEYS',
  'AE_INQUIRY_ACCESS_KEY_ID',
  'AE_INQUIRY_ACCESS_SECRET',
  'AE_INQUIRY_RECEIPT_KEK',
  'AE_INQUIRY_RECEIPT_KEK_ID',
  'AE_REQUIRE_AUTHENTICATED_E2E',
  'AUTUMN_API_VERSION',
  'AUTUMN_ENVIRONMENT',
  'AUTUMN_PROJECT_ID',
  'AUTUMN_SECRET_KEY',
  'AUTUMN_WEBHOOK_SECRET',
  'CLERK_PUBLISHABLE_KEY',
].sort()

describe('env-example-drift', () => {
  it('renders deterministically for the same inputs', () => {
    const manifest = loadManifestInput()
    const convexEnvNames = loadConvexEnvNames()
    const unclassifiedNames = computeUnclassifiedNames(manifest, convexEnvNames, readCurrentEnvExample())

    const first = renderEnvExample({ manifest, convexEnvNames, unclassifiedNames })
    const second = renderEnvExample({ manifest, convexEnvNames, unclassifiedNames })

    expect(first).toBe(second)
  })

  it('renders every manifest group name and every convex env name exactly once in its section', () => {
    const manifest = loadManifestInput()
    const convexEnvNames = loadConvexEnvNames()
    const rendered = renderEnvExample({ manifest, convexEnvNames })

    const [webSection, convexSection] = splitSections(rendered)

    const webServerNames = [
      ...manifest.requiredProduction.flatMap((group) => group.names),
      ...manifest.controlledPackage5.flatMap((group) => group.names),
      ...manifest.conditional.flatMap((group) => group.names),
      ...manifest.optional,
      ...manifest.forbiddenProduction,
      ...manifest.knownNames,
    ]
    for (const name of new Set(webServerNames)) {
      expect(countNameOccurrences(webSection, name)).toBe(1)
    }

    for (const name of new Set(convexEnvNames)) {
      expect(countNameOccurrences(convexSection, name)).toBe(1)
    }
  })

  it('matches the working-tree .env.example produced by the last render', () => {
    const manifest = loadManifestInput()
    const convexEnvNames = loadConvexEnvNames()
    const current = readCurrentEnvExample()
    const unclassifiedNames = computeUnclassifiedNames(manifest, convexEnvNames, current)
    const rendered = renderEnvExample({ manifest, convexEnvNames, unclassifiedNames })

    expect(rendered).toBe(current)
    expect(ENV_EXAMPLE_PATH).toBe(path.join(REPO_ROOT, '.env.example'))
  })

  it('surfaces the exact known-unclassified list (declare in manifest.ts or delete to shrink it)', () => {
    const manifest = loadManifestInput()
    const convexEnvNames = loadConvexEnvNames()
    const unclassifiedNames = computeUnclassifiedNames(manifest, convexEnvNames, readCurrentEnvExample())

    expect([...unclassifiedNames].sort()).toStrictEqual(EXPECTED_UNCLASSIFIED_NAMES)
  })
})

function splitSections(rendered: string): [string, string] {
  const convexHeaderIndex = rendered.indexOf('## Convex deployment')
  const unclassifiedHeaderIndex = rendered.indexOf('## Unclassified')
  const webSection = rendered.slice(0, convexHeaderIndex)
  const convexSection = rendered.slice(
    convexHeaderIndex,
    unclassifiedHeaderIndex === -1 ? rendered.length : unclassifiedHeaderIndex,
  )
  return [webSection, convexSection]
}

function countNameOccurrences(section: string, name: string): number {
  const matches = section.match(new RegExp(`^${name}=`, 'gm'))
  return matches?.length ?? 0
}
