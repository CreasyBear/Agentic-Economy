import { convexTest } from 'convex-test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
  readDeveloperDiscoveryRoute,
  type DeveloperDiscoveryRouteSnapshot,
} from '@/modules/discovery/developer-discovery'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [
  path.replace('../../convex/', './'),
  load,
]))

describe('durable llms Offering parity', () => {
  it('uses Offering cutover truth, retains profile-only businesses, and excludes legacy and private detail', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const ownerId = await ctx.db.insert('owners', {
        clerkUserId: 'owner:llms-parity', createdAt: 1, updatedAt: 1,
      })
      const offeringBusinessId = await ctx.db.insert('businesses', {
        ownerId, slug: 'offering-engineering', name: 'Offering Engineering', normalizedName: 'offering engineering',
        category: 'Engineering', suburb: 'Perth', stateTerritory: 'WA',
        publicStatus: 'published', trustTier: 'listed', claimStatus: 'published',
        sourceHash: 'business:offering-engineering', createdAt: 1, updatedAt: 1,
      })
      await ctx.db.insert('businessServices', {
        businessId: offeringBusinessId, serviceSlug: 'retired-legacy-drilling',
        name: 'Retired Legacy Drilling', category: 'Engineering',
        summary: 'Must not return after Offering cutover.', serviceArea: 'WA',
        hoursOrUnknown: 'Retired', status: 'published', sortOrder: 0,
        sourceHash: 'legacy:retired', createdAt: 1, updatedAt: 1,
      })
      await ctx.db.insert('catalogSupplyCutovers', {
        businessId: offeringBusinessId, mode: 'offering', lastCheckStatus: 'matched',
        postCutoverNativeChanges: false, updatedAt: 2,
      })
      await ctx.db.insert('businessSupplyProjectionSnapshots', {
        businessId: offeringBusinessId, sourceRevision: 2, sourceDigest: 'projection:engineering',
        observedAt: 2, disposition: 'current', status: 'current', updatedAt: 2,
        projectionJson: JSON.stringify({
          business: {
            businessId: offeringBusinessId, slug: 'offering-engineering', name: 'Offering Engineering',
            category: 'Engineering', suburb: 'Perth', stateTerritory: 'WA',
            publicUrl: '/offering-engineering',
          },
          offerings: [{
            offering: {
              offeringRef: 'offering:current-design', revision: 2, name: 'Current Design Review',
              category: 'Engineering', summary: 'Current public Offering.',
            },
            accessPaths: [{
              accessPathRef: 'path:design', credentialRef: 'secret:must-not-leak',
              descriptor: {
                kind: 'external_operation', name: 'Design API', summary: 'Declared access.',
                url: 'https://engineering.example/api', provenance: 'business_declared',
              },
            }],
            support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
          }],
          sourceRevision: 2, sourceDigest: 'projection:engineering', observedAt: 2,
          disposition: 'current',
        }),
      })

      const profileBusinessId = await ctx.db.insert('businesses', {
        ownerId, slug: 'profile-only-consulting', name: 'Profile Only Consulting', normalizedName: 'profile only consulting',
        category: 'Consulting', suburb: 'Fremantle', stateTerritory: 'WA',
        publicStatus: 'published', trustTier: 'listed', claimStatus: 'published',
        sourceHash: 'business:profile-only', createdAt: 1, updatedAt: 1,
      })
      await ctx.db.insert('catalogSupplyCutovers', {
        businessId: profileBusinessId, mode: 'offering', lastCheckStatus: 'matched',
        postCutoverNativeChanges: false, updatedAt: 2,
      })
      await ctx.db.insert('businessSupplyProjectionSnapshots', {
        businessId: profileBusinessId, sourceRevision: 1, sourceDigest: 'projection:profile',
        observedAt: 2, disposition: 'current', status: 'current', updatedAt: 2,
        projectionJson: JSON.stringify({
          business: {
            businessId: profileBusinessId, slug: 'profile-only-consulting', name: 'Profile Only Consulting',
            category: 'Consulting', suburb: 'Fremantle', stateTerritory: 'WA',
            publicUrl: '/profile-only-consulting',
          },
          offerings: [], sourceRevision: 1, sourceDigest: 'projection:profile', observedAt: 2,
          disposition: 'current',
        }),
      })
    })

    const result = await backend.query(api.discovery.readLlmsTxt, {
      canonicalBaseUrl: 'https://ae.example', routingBaseUrl: 'https://ae.example', now: 3,
    })
    expect(result.body).toContain('slug=offering-engineering')
    expect(result.body).toContain('offerings=Current Design Review')
    expect(result.body).toContain('slug=profile-only-consulting')
    expect(result.body).toContain('offerings=none')
    expect(result.body).not.toContain('Retired Legacy Drilling')
    expect(result.body).not.toContain('secret:must-not-leak')
    expect(result.body).not.toContain('credentialRef')
  })
})

describe('Offering-v2 discovery consumers', () => {
  it('preserves exact Offering revisions and both closed profiles in route-derived discovery facts', () => {
    const business = offeringProfilePair()
    const snapshot: DeveloperDiscoveryRouteSnapshot = {
      list: successfulRoute('/api/businesses', {
        kind: 'ok',
        schemaVersion: 'public-business-catalog-api:v2',
        items: [business],
        pagination: { limit: 10, total: 1, hasMore: false },
      }),
      search: successfulRoute('/api/businesses/search?q=profile', {
        kind: 'ok',
        schemaVersion: 'public-business-catalog-api:v2',
        query: 'profile',
        items: [business],
        pagination: { limit: 10, total: 1, hasMore: false },
      }),
      detail: successfulRoute('/api/businesses/profile-pair', {
        kind: 'found',
        schemaVersion: 'public-business-catalog-api:v2',
        business,
      }),
      routeExecutions: [
        successfulExecution('/api/businesses'),
        successfulExecution('/api/businesses/search?q=profile'),
        successfulExecution('/api/businesses/profile-pair'),
      ],
    }

    const readback = readDeveloperDiscoveryRoute(emptyDiscoveryState(), {
      canonicalBaseUrl: 'https://ae.example',
      now: 1_725_000_000_001,
      routeSnapshot: snapshot,
      operatorControls: [{ key: 'developer_discovery_publish_enabled', effectiveEnabled: true }],
    })

    expect(readback.publicFacts[0]?.offerings).toEqual(
      business.offerings.map((offering) => ({
        offeringRef: offering.offeringRef,
        revision: offering.revision,
        comparison: offering.comparison,
      })),
    )
    expect(readback.structuredRegistryAdapters).toEqual([
      { actionId: 'registry.list', method: 'GET', path: '/api/businesses' },
      { actionId: 'registry.search', method: 'GET', path: '/api/businesses/search' },
      { actionId: 'registry.detail', method: 'GET', path: '/api/businesses/{slug}' },
    ])
    expect(JSON.stringify(readback)).not.toMatch(/agentJson.*(?:reachable|callable)|api\/agent\/tools/i)
    expect(readback.comparisonAdapter).toEqual({
      state: 'deferred',
      method: 'POST',
      path: '/api/compare',
      ownerPlan: '05-07',
    })
  })

  it('enforces the reviewed flow-aware consumer inventory and rejects v1 action-output flow', () => {
    const reviewed = [
      ['src/modules/registry/public-inquiry-projection.ts', 'legacy_catalog_v1_only'],
      ['src/modules/registry/internal/search-documents.ts', 'split_legacy_v1_and_offering_v2'],
      ['src/modules/answer/internal/dto-to-answer-source.ts', 'registry_action_offering_v2'],
      ['src/modules/answer/answer-synthesizer.ts', 'answer_offering_v2'],
      ['src/modules/answer-thread/internal/tool-runner.ts', 'registry_action_offering_v2'],
      ['src/modules/discovery/internal/ucp-manifest.ts', 'legacy_catalog_v1_only'],
      ['src/modules/discovery/developer-discovery.ts', 'split_legacy_v1_and_offering_v2'],
      ['src/modules/discovery/internal/discovery-files.ts', 'offering_v2_projection'],
    ] as const

    const declared = reviewed.map(([path]) => {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8')
      return [path, source.match(/@offering-consumer-disposition\s+([a-z0-9_]+)/u)?.[1]]
    })
    expect(declared).toEqual(reviewed)

    const legacyActionOutputConsumers = productionTypeScriptFiles()
      .map((path) => ({ path, flow: classifyRegistryFlow(path) }))
      .filter(({ flow }) => flow === 'registry_action_legacy_v1')
      .map(({ path }) => path)

    expect(legacyActionOutputConsumers).toEqual([])
  })
})

function offeringProfilePair(): PublicBusinessCatalogApiV2Dto {
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: 'business:profile-pair',
    slug: 'profile-pair',
    name: 'Profile Pair',
    category: 'Mixed demonstration',
    suburb: 'Perth',
    stateTerritory: 'WA',
    publicUrl: '/profile-pair',
    observedAt: 1_725_000_000_000,
    disposition: 'current',
    offerings: [
      {
        offeringRef: 'offering:professional',
        revision: 7,
        name: 'Website discovery',
        category: 'Professional service',
        summary: 'A bounded discovery engagement.',
        comparison: {
          schemaVersion: 'offering-comparison:v1',
          profile: {
            profileId: 'professional_service:v1',
            scopeBasis: known('Discovery and recommendation'),
            priceBasis: known({ description: 'Fixed discovery fee', currency: 'AUD', amountMinor: 125_000, unit: 'total' }),
            timingBasis: known('Two weeks'),
            serviceArea: known('Perth'),
          },
        },
        accessPaths: [],
        support: { integrated: false, aeSupportedAction: false },
      },
      {
        offeringRef: 'offering:machine',
        revision: 11,
        name: 'Current inventory feed',
        category: 'Machine data',
        summary: 'A read-only inventory feed.',
        comparison: {
          schemaVersion: 'offering-comparison:v1',
          profile: {
            profileId: 'machine_data:v1',
            interfaceFormat: known('rest_json'),
            requestMethod: known('GET'),
            authentication: known('api_key'),
            priceBasis: known({ description: 'Per request', currency: 'AUD', amountMinor: 2, unit: 'request' }),
            freshnessOrUpdateCadence: known('Updated every hour'),
          },
        },
        accessPaths: [],
        support: { integrated: true, aeSupportedAction: false },
      },
    ],
    accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
  }
}

function known<T>(value: T) {
  return {
    kind: 'known' as const,
    value,
    source: { kind: 'business_supplied' as const },
    observedAt: 1_724_999_000_000,
  }
}

function successfulExecution(route: string) {
  return {
    route,
    label: route,
    ok: true,
    checkedAt: 1_725_000_000_001,
    httpStatus: 200,
    schemaVersion: 'public-business-catalog-api:v2',
    expectedSchemaVersion: 'public-business-catalog-api:v2',
  } as const
}

function successfulRoute<Body>(route: string, body: Body) {
  return { ...successfulExecution(route), body }
}

function emptyDiscoveryState(): DiscoverySourceState {
  return {
    businesses: [],
    businessServices: [],
    serviceCapabilities: [],
    operationKeys: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    registrySearchSyncAttempts: [],
    discoveryManifestAttempts: [],
    indexStatus: [],
    auditEvents: [],
  }
}

function productionTypeScriptFiles(): string[] {
  return ts.sys.readDirectory(
    resolve(process.cwd(), 'src'),
    ['.ts', '.tsx'],
    undefined,
    undefined,
  ).map((path) => path.slice(process.cwd().length + 1)).sort()
}

function classifyRegistryFlow(path: string): 'registry_action_legacy_v1' | 'other' {
  const source = readFileSync(resolve(process.cwd(), path), 'utf8')
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const importedNames = new Set<string>()
  let importsActionLookup = false

  file.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return
    const moduleName = node.moduleSpecifier.text
    const names = node.importClause?.namedBindings
    if (names !== undefined && ts.isNamedImports(names)) {
      for (const element of names.elements) importedNames.add(element.name.text)
    }
    if (
      moduleName === '@/modules/actions'
      || moduleName.endsWith('/registry.actions')
    ) {
      importsActionLookup = true
    }
  })

  const importsLegacyOutput = [
    'PublicBusinessCatalogApiDto',
    'PublicBusinessCatalogApiPage',
    'PublicBusinessCatalogDetailResult',
  ].some((name) => importedNames.has(name))
  const namesRegistryAction = /registry\.(?:list|search|detail)/u.test(source)

  return importsActionLookup && namesRegistryAction && importsLegacyOutput
    ? 'registry_action_legacy_v1'
    : 'other'
}
