import { describe, expect, it } from 'vitest'

import {
  scanConvexFacadeSizes,
  type ConvexFacadeFile,
} from '@/lib/ui/contract-scans/convex-facade-size'

import { fixtureTargets, isFixtureMode } from './scan-targets'

const FACADE_MAX_LINES = 200
// pinned 2026-09-21 from first run; may only decrease
const FACADE_SIZE_EXCEPTIONS: Record<string, number> = {
  'convex/actionExecutionControl.ts': 388,
  'convex/agentAccessPolicy.ts': 329,
  'convex/agentSpendingPolicy.ts': 542,
  'convex/authorityBoundary.ts': 438,
  'convex/businesses.ts': 362,
  'convex/capabilityCallProjection.ts': 874,
  'convex/capabilityCallProjections.ts': 406,
  'convex/capabilityCalls.ts': 363,
  'convex/capabilityCallWorker.ts': 365,
  'convex/capabilityCallX402AuthorizationExpiry.ts': 231,
  'convex/capabilityContractDocuments.ts': 345,
  'convex/capabilityProviderApprovals.ts': 249,
  'convex/capabilityProviderConnectionCleanup.ts': 257,
  'convex/capabilityProviderConsequenceJournal.ts': 987,
  'convex/capabilityProviderTools.ts': 465,
  'convex/capabilitySupplyCommands.ts': 299,
  'convex/capabilitySupplyGraph.ts': 253,
  'convex/capabilitySupplyGraphPorts.ts': 239,
  'convex/capabilitySupplyIntegrationDrafts.ts': 310,
  'convex/capabilitySupplyLists.ts': 463,
  'convex/capabilitySupplyOwnerFunnelCommands.ts': 768,
  'convex/capabilitySupplyOwnerFunnelProjection.ts': 609,
  'convex/capabilitySupplyProjection.ts': 734,
  'convex/capabilitySupplyPublicationPorts.ts': 247,
  'convex/capabilitySupplyReadiness.ts': 314,
  'convex/capabilitySupplyToolOriginMap.ts': 227,
  'convex/capabilitySupplyToolQueries.ts': 451,
  'convex/capabilitySupplyToolShared.ts': 470,
  'convex/catalogOfferingMutations.ts': 490,
  'convex/catalogPublicReads.ts': 368,
  'convex/chatAnonymous.ts': 213,
  'convex/chatMessages.ts': 247,
  'convex/chatShares.ts': 402,
  'convex/chatThreads.ts': 226,
  'convex/devSeed.ts': 917,
  'convex/facilitatorDiscovery.ts': 553,
  'convex/interactiveCredentialLifecycle.ts': 297,
  'convex/interactiveSession.ts': 241,
  'convex/marketDemandSignals.ts': 244,
  'convex/moneyAccountFunding.ts': 223,
  'convex/moneyAutoRecharge.ts': 346,
  'convex/moneyBillingAuthorization.ts': 606,
  'convex/moneyCommercialPolicy.ts': 465,
  'convex/moneyConnect.ts': 936,
  'convex/moneyCustomerTaxFacts.ts': 367,
  'convex/moneyDocuments.ts': 849,
  'convex/moneyFormance.ts': 527,
  'convex/moneyLedger.ts': 368,
  'convex/moneyManagedCall.ts': 327,
  'convex/moneyManagedCallLifecycle.ts': 320,
  'convex/moneyMonthlySpendBudget.ts': 318,
  'convex/moneyProviderObligations.ts': 430,
  'convex/moneyStripeCustomer.ts': 360,
  'convex/notifications.ts': 471,
  'convex/personalAccount.ts': 652,
  'convex/qualifiedUse.ts': 248,
  'convex/recoveryBreakGlass.ts': 482,
  'convex/registry.ts': 445,
  'convex/securityAccountHistory.ts': 565,
  'convex/securityAdminMembership.ts': 323,
  'convex/securityRemovalDisputes.ts': 437,
  'convex/securityShared.ts': 205,
  'convex/sourceWriteAdmission.ts': 302,
  'convex/workloadCron.ts': 628,
  'convex/workspaceAccounts.ts': 649,
  'convex/workspaceInvitations.ts': 382,
  'convex/workspaceMemberships.ts': 693,
  'convex/workspaceProfile.ts': 257,
  'convex/workspaceProvisioning.ts': 393,
  'convex/workspaceSecurity.ts': 296,
  'convex/workspaceTeam.ts': 242,
  'convex/x402DirectoryIndex.ts': 455,
  'convex/x402DirectoryIndexStore.ts': 689,
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
  it('keeps depth-one RPC façades within the size limit', () => {
    const result = scanConvexFacadeSizes(
      isFixtureMode() ? fixtureTargets(FIXTURE_ROOT) : cleanTargets(),
      FACADE_MAX_LINES,
    )

    if (isFixtureMode()) {
      expect(result.files).toContainEqual(
        expect.objectContaining({
          file: `${FIXTURE_ROOT}/oversized.fixture`,
          isFacade: true,
        }),
      )
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          file: `${FIXTURE_ROOT}/oversized.fixture`,
          rule: 'convex-facade-size',
        }),
      )
      expect(result.files.find(({ isFacade }) => isFacade)?.lines).toBeGreaterThan(
        FACADE_MAX_LINES,
      )
      return
    }

    const facades = result.files.filter(({ isFacade }) => isFacade)
    const unexceptedOffenders = facades.filter(
      ({ file, lines }) =>
        lines > FACADE_MAX_LINES && FACADE_SIZE_EXCEPTIONS[file] === undefined,
    )

    expect(
      unexceptedOffenders,
      `Found non-exception Convex façades over ${FACADE_MAX_LINES} lines:\n` +
        formatFiles(unexceptedOffenders),
    ).toEqual([])

    for (const [file, ceiling] of Object.entries(FACADE_SIZE_EXCEPTIONS)) {
      const actual = facades.find((facade) => facade.file === file)?.lines

      expect(actual, `${file} is no longer a Convex façade; remove it from FACADE_SIZE_EXCEPTIONS`).toBeDefined()
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
