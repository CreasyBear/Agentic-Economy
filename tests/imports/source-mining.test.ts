import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { scanSourceMining } from '@/lib/ui/contract-scans'

import { cleanRuntimeTargets, fixtureTargets, isFixtureMode } from './scan-targets'

describe('source-mining guardrail', () => {
  it('rejects backup coupling and Phase 2+ surface symbols', () => {
    const violations = scanSourceMining(
      isFixtureMode() ? fixtureTargets('tests/fixtures/bad-source-mining') : cleanRuntimeTargets()
    )

    if (isFixtureMode()) {
      expect(violations.map((violation) => violation.rule)).toEqual(
        expect.arrayContaining(['backup-source-reference', 'future-surface-symbol', 'future-protocol-symbol'])
      )
      return
    }

    expect(violations).toEqual([])
  })

  it('maps every mined Phase 1 invariant row to fresh seams and executable tests', () => {
    const ledger = readFileSync('.planning/source-mining/phase-1-ledger.md', 'utf8')

    for (const row of sourceMiningLedgerRows) {
      for (const needle of row.ledgerNeedles) {
        expect(ledger, `${row.label} ledger missing ${needle}`).toContain(needle)
      }

      for (const seam of row.publicSeams) {
        const content = readFileSync(seam.file, 'utf8')
        for (const exportName of seam.exports) {
          expect(content, `${row.label} seam missing ${seam.file}#${exportName}`).toContain(exportName)
        }
      }

      for (const testFile of row.testFiles) {
        expect(existsSync(testFile), `${row.label} missing executable test ${testFile}`).toBe(true)
      }
    }
  })
})

const sourceMiningLedgerRows = [
  {
    label: 'business claim/publish',
    ledgerNeedles: ['convex/claimPublishing.ts', 'no-ABN T0 publish', 'wrong-owner publish rejected'],
    publicSeams: [
      { file: 'src/modules/business/public.ts', exports: ['claimBusiness', 'suppressBusiness'] },
      { file: 'src/modules/catalog/public.ts', exports: ['publishBusinessCatalog', 'getPublicBusinessCatalog'] },
    ],
    testFiles: [
      'tests/unit/business/claim.test.ts',
      'tests/unit/catalog/publish.test.ts',
      'tests/integration/claim-publish.test.ts',
    ],
  },
  {
    label: 'lifecycle descriptor',
    ledgerNeedles: ['src/lib/registry/lifecycle/*', 'descriptor-only lifecycle module', 'primitive descriptor tests'],
    publicSeams: [{ file: 'src/modules/lifecycle/public.ts', exports: ['LifecyclePrimitiveValues'] }],
    testFiles: ['tests/unit/lifecycle/lifecycle-descriptor.test.ts'],
  },
  {
    label: 'security admin and disputes',
    ledgerNeedles: ['backup admin membership', 'assertCsrf', 'openDispute'],
    publicSeams: [
      {
        file: 'src/modules/security/public.ts',
        exports: ['assertCsrf', 'rateLimitClaim', 'detectDuplicateClaim', 'requireAdminAuthority', 'openRemovalDispute'],
      },
    ],
    testFiles: [
      'tests/unit/security/admin-authority.test.ts',
      'tests/unit/security/csrf-rate-limit.test.ts',
      'tests/unit/security/disputes.test.ts',
    ],
  },
  {
    label: 'registry search and repair',
    ledgerNeedles: ['src/lib/registry/directory/*', 'src/lib/search/meilisearch.ts', 'retry/rebuild'],
    publicSeams: [
      {
        file: 'src/modules/registry/public.ts',
        exports: ['syncCatalogProjection', 'retryRegistryProjection', 'searchPublicBusinessCatalog', 'getIndexStatus'],
      },
    ],
    testFiles: ['tests/unit/registry/projection-attempts.test.ts', 'tests/integration/registry-api.test.ts'],
  },
  {
    label: 'discovery manifest files',
    ledgerNeedles: ['src/lib/registry/discovery/ucpManifest.ts', 'tests/seo/discovery-files.test.ts', 'prompt-injection fixture'],
    publicSeams: [
      {
        file: 'src/modules/discovery/public.ts',
        exports: ['buildCatalogDiscoveryManifest', 'regenerateDiscoveryManifest', 'buildLlmsTxt'],
      },
    ],
    testFiles: [
      'tests/unit/discovery/ucp-manifest.test.ts',
      'tests/integration/discovery-routes.test.ts',
      'tests/integration/discovery-prompt-injection.test.ts',
      'tests/seo/discovery-files.test.ts',
    ],
  },
  {
    label: 'seo and copy',
    ledgerNeedles: ['src/lib/seo/localBusiness.ts', 'claims-register scan', 'JSON-LD escape'],
    publicSeams: [{ file: 'src/modules/seo/public.ts', exports: ['buildPublicBusinessSeo', 'serializeJsonLd'] }],
    testFiles: [
      'tests/seo/public-business-seo.test.ts',
      'tests/unit/seo-json-ld.test.ts',
      'tests/copy/claims-register.test.ts',
    ],
  },
  {
    label: 'observability audit and controls',
    ledgerNeedles: ['typed audit', 'visible operational gaps', 'operatorControls'],
    publicSeams: [
      {
        file: 'src/modules/observability/public.ts',
        exports: ['validateAuditEvent', 'reserveOperationKey', 'setOperatorControl', 'FunnelEventTypeValues'],
      },
    ],
    testFiles: [
      'tests/unit/observability/audit-redaction.test.ts',
      'tests/unit/observability/operation-keys.test.ts',
      'tests/unit/observability/operator-controls.test.ts',
      'tests/unit/observability/funnel.test.ts',
    ],
  },
] as const
