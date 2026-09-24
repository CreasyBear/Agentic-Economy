// Root coverage and ratchet policy: docs/operations/convex-root-protocol.md.
import { readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  scanConvexFacadeSizes,
  type ConvexFacadeFile,
} from '@/lib/ui/contract-scans/convex-facade-size'

import { fixtureTargets, isFixtureMode } from './scan-targets'

const FACADE_MAX_LINES = 200
// Pinned debt only; roots above 200 lines remain visible and pins may only decrease.
const FACADE_SIZE_EXCEPTIONS: Record<string, number> = {
  'convex/actionExecutionControl.ts': 388,
  'convex/agentSpendingPolicy.ts': 542,
  'convex/businessSupplyProjectionSnapshot.ts': 424,
  'convex/capabilityCallProjections.ts': 405,
  'convex/capabilityCalls.ts': 356,
  'convex/capabilityCallWorker.ts': 363,
  'convex/capabilityCallX402AuthorizationExpiry.ts': 231,
  'convex/capabilityContractDocuments.ts': 345,
  'convex/capabilityProviderConnectionCleanup.ts': 257,
  'convex/capabilityProviderConnections.ts': 277,
  'convex/capabilityProviderTools.ts': 465,
  'convex/capabilitySupplyCommands.ts': 299,
  'convex/capabilitySupplyGraph.ts': 253,
  'convex/capabilitySupplyIntegrationDrafts.ts': 310,
  'convex/capabilitySupplyLists.ts': 463,
  'convex/capabilitySupplyShared.ts': 251,
  'convex/capabilitySupplyToolOriginMap.ts': 227,
  'convex/capabilitySupplyToolQueries.ts': 451,
  'convex/capabilitySupplyToolShared.ts': 470,
  'convex/catalogPublicReads.ts': 366,
  'convex/chatAnonymous.ts': 213,
  'convex/chatGenerate.ts': 217,
  'convex/chatShares.ts': 402,
  'convex/chatTools.ts': 529,
  'convex/devSeed.ts': 1162,
  'convex/devSeedFixtures.ts': 503,
  'convex/interactiveCredentialLifecycle.ts': 270,
  'convex/interactiveSession.ts': 241,
  'convex/marketDemandSignals.ts': 244,
  'convex/moneyAutoRecharge.ts': 346,
  'convex/moneyCustomerTaxFacts.ts': 367,
  'convex/moneyMonthlySpendBudget.ts': 318,
  'convex/moneyProviderObligations.ts': 377,
  'convex/moneyStripeCustomer.ts': 360,
  'convex/notifications.ts': 471,
  'convex/personalAccount.ts': 652,
  'convex/providerConsequenceHttp.ts': 322,
  'convex/qualifiedUse.ts': 233,
  'convex/recoveryBreakGlass.ts': 482,
  'convex/registry.ts': 443,
  'convex/secretLifecycleHttp.ts': 216,
  'convex/securityAccountHistory.ts': 565,
  'convex/securityAdminMembership.ts': 216,
  'convex/securityRemovalDisputes.ts': 245,
  'convex/securityShared.ts': 205,
  'convex/sourceWriteAdmission.ts': 299,
  'convex/workspaceInvitations.ts': 382,
  'convex/workspaceMemberships.ts': 693,
  'convex/workspaceProfile.ts': 257,
  'convex/workspaceProvisioning.ts': 393,
  'convex/workspaceSecurity.ts': 295,
}
const FACADE_SIZE_MARGIN = 0
const FIXTURE_ROOT = 'tests/fixtures/quality-gates/convex-facade-size'

function cleanTargets() {
  return [{ root: 'convex', includeExtensions: ['.ts'] }] as const
}

function formatFiles(files: readonly ConvexFacadeFile[]): string {
  return files
    .map(({ file, lines }) => `  ${lines}  ${file}`)
    .join('\n')
}

describe('Convex façade size ratchet', () => {
  it('keeps every depth-one Convex root within the size limit', () => {
    const result = scanConvexFacadeSizes(
      isFixtureMode() ? fixtureTargets(FIXTURE_ROOT) : cleanTargets(),
      FACADE_MAX_LINES,
    )

    if (isFixtureMode()) {
      expect(result.files).toContainEqual(
        expect.objectContaining({
          file: `${FIXTURE_ROOT}/oversized.fixture`,
        }),
      )
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          file: `${FIXTURE_ROOT}/oversized.fixture`,
          rule: 'convex-facade-size',
        }),
      )
      expect(result.files.find(({ file }) => file === `${FIXTURE_ROOT}/oversized.fixture`)?.lines).toBeGreaterThan(
        FACADE_MAX_LINES,
      )
      return
    }

    const roots = result.files
    expect(roots.map(({ file }) => file)).toEqual(
      readdirSync('convex', { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
        .map((entry) => `convex/${entry.name}`)
        .sort((left, right) => left.localeCompare(right)),
    )
    const unexceptedOffenders = roots.filter(
      ({ file, lines }) =>
        lines > FACADE_MAX_LINES && FACADE_SIZE_EXCEPTIONS[file] === undefined,
    )

    expect(
      unexceptedOffenders,
      `Found non-exception Convex roots over ${FACADE_MAX_LINES} lines:\n` +
        formatFiles(unexceptedOffenders),
    ).toEqual([])

    for (const [file, ceiling] of Object.entries(FACADE_SIZE_EXCEPTIONS)) {
      const actual = roots.find((root) => root.file === file)?.lines

      expect(actual, `${file} is no longer a Convex root; remove it from FACADE_SIZE_EXCEPTIONS`).toBeDefined()
      expect(
        actual,
        `${file} grew ${ceiling}→${actual ?? 'missing'}`,
      ).toBeLessThanOrEqual(ceiling)
      expect(
        actual,
        `remove ${file} from FACADE_SIZE_EXCEPTIONS`,
      ).toBeGreaterThan(FACADE_MAX_LINES)
      expect(
        ceiling - (actual ?? ceiling),
        `Lower FACADE_SIZE_EXCEPTIONS[${file}] to ${actual ?? 'missing'}`,
      ).toBeLessThanOrEqual(FACADE_SIZE_MARGIN)
    }
  })
})
