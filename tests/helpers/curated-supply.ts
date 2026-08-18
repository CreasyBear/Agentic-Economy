/**
 * Curated heterogeneous real-supply fixture for the Customer Request kernel.
 *
 * Models the system-level capability-supply pattern that Agentic Market and the
 * x402 docs describe: the registry/kernel must onboard and execute operations of
 * materially HETEROGENEOUS shapes through one unchanged seam. The shipped
 * curated providers are used because they are the real, source-owned supply:
 *
 *   frankfurter.single-rate — GET /query, keyless, two required inputs (base/quote)
 *   exa.search             — POST /JSON, credential, query + numResults + type
 *   exa.contents           — POST /JSON, credential, urls
 *
 * Nothing here is Frankfurter-specific: the contract reader and the fact builder
 * derive from each capability's own decision model and schema, so a test can
 * exercise any capability (or a heterogeneous mix) without hardcoding its input
 * shape.
 */
import type { TestConvex } from 'convex-test'

import { decodeDurableCapabilityContract } from '@/modules/capability-contract-registry/public'
import { openCapabilityDecisionModel, type CapabilityContract, type CapabilityDecisionModel } from '@/modules/capability-contract/public'

type RequestFact = Readonly<{
  contractRef: CapabilityDecisionModel['contractRef']
  selectionKey: CapabilityDecisionModel['selectionKey']
  inputKey: CapabilityDecisionModel['inputs'][number]['key']
  inputPointer: string
  schemaIdentity: CapabilityDecisionModel['inputs'][number]['schemaIdentity']
  value: string
  source: Readonly<{ kind: 'customer'; assertionRef: string }>
}>
import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules } from './convex-fixtures'

export const CURATED_CAPABILITY_IDS = [
  'frankfurter.single-rate',
  'exa.search',
  'exa.contents',
] as const

export type CuratedCapabilityId = (typeof CURATED_CAPABILITY_IDS)[number]

function isCuratedCapabilityId(value: string): value is CuratedCapabilityId {
  return (CURATED_CAPABILITY_IDS as readonly string[]).includes(value)
}

/**
 * Read the active, source-owned CapabilityContract for a curated capability from
 * the deployed contract registry. Fails loudly if the real record is missing, so
 * a test cannot silently fall back to a fixture contract.
 */
export async function readCuratedContract(
  backend: TestConvex<typeof schema>,
  capabilityId: string,
): Promise<CapabilityContract> {
  if (!isCuratedCapabilityId(capabilityId)) {
    throw new Error(`curated_capability_not_registered:${capabilityId}`)
  }
  const row = await backend.run(async (ctx) => (
    await ctx.db.query('capabilityContractDocuments')
      .withIndex('by_status_and_capabilityId_and_version', (query) => (
        query.eq('status', 'active').eq('capabilityId', capabilityId)
      ))
      .order('desc')
      .first()
  ))
  if (row === null) throw new Error(`curated_contract_missing:${capabilityId}`)
  const { _id: _rowId, _creationTime: _rowCreationTime, ...contractRow } = row
  const decoded = decodeDurableCapabilityContract({
    ref: {
      capabilityId: contractRow.capabilityId,
      version: contractRow.version,
      contractDigest: contractRow.contractDigest,
    },
    documentJson: contractRow.documentJson,
    status: contractRow.status,
    registeredAt: contractRow.registeredAt,
  })
  if (decoded.kind !== 'found') throw new Error(`curated_contract_unavailable:${capabilityId}`)
  return decoded.contract
}

export async function readCuratedModel(
  backend: TestConvex<typeof schema>,
  capabilityId: string,
): Promise<CapabilityDecisionModel> {
  return openCapabilityDecisionModel(await readCuratedContract(backend, capabilityId))
}

const SCHEMA_PATTERN_DEFAULTS: Record<string, string> = {
  '^[A-Z]{3}$': 'EUR',
  '^[0-9]+$': '1',
}

/**
 * Build a customer-supplied fact for every input on a capability's decision
 * model, deriving a schema-valid representative value from the pointed input
 * schema. This keeps the fixture shape-agnostic: it works for Frankfurter's
 * base/quote, Exa's query/numResults/type, and any future curated capability,
 * and never hardcodes a provider's specific field names into a test.
 */
export function factsForModel(
  model: CapabilityDecisionModel,
  overrides: Readonly<Record<string, string>> = {},
): RequestFact[] {
  return model.inputs.map((input) => {
    const pointerKey = input.inputPointer.replace(/^\//u, '')
    const value = (
      overrides[pointerKey]
      ?? overrides[input.annotationId]
      ?? representativeValueForSchema(model, input.inputPointer, input.label)
    )
    return {
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      inputKey: input.key,
      inputPointer: input.inputPointer,
      schemaIdentity: input.schemaIdentity,
      value,
      source: { kind: 'customer' as const, assertionRef: 'assertion:curated-test' },
    }
  })
}

function representativeValueForSchema(
  model: CapabilityDecisionModel,
  pointer: string,
  label: string,
): string {
  const fallbackMatches = Object.entries(SCHEMA_PATTERN_DEFAULTS).find(([pattern]) => (
    new RegExp(pattern).test(label)
  ))
  if (fallbackMatches !== undefined) return fallbackMatches[1]
  if (/currency|quote|base/i.test(pointer)) return 'EUR'
  if (/currency|quote|base/i.test(label)) return 'EUR'
  if (/url|link/i.test(pointer) && label.toLowerCase() === 'urls') return 'https://example.test/a'
  return 'a'
}

/**
 * Seed the curated real supply in a test backend (idempotently re-usable with
 * devSeed) and make its publications ready so they are routeable. Mirrors the
 * production onboarding path; never fabricates readiness for a missing record.
 */
export async function seedCuratedSupply(
  backend: TestConvex<typeof schema>,
): Promise<void> {
  await backend.mutation(internal.devSeed.seedDevCatalog, {})
  await markCuratedSupplyReady(backend)
}

export async function markCuratedSupplyReady(
  backend: TestConvex<typeof schema>,
): Promise<void> {
  const publications = await backend.run(async (ctx) => (
    await ctx.db.query('capabilityPublications').collect()
  ))
  if (publications.length === 0) throw new Error('curated_supply_publications_missing')
  const now = Date.now()
  for (const publication of publications) {
    const result = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: publication.publicationRef,
      expectedRevision: publication.revision,
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: now + 300_000,
      operationKey: `test:observe-publication:${publication.publicationRef}`,
      correlationId: 'test:curated-supply',
      reasonCode: 'test_readiness',
      evidenceRefs: ['test:readiness'],
    })
    if (result.kind !== 'observed') throw new Error(`curated readiness failed: ${result.reason}`)
  }
}

export { internal as _curatedInternalForTests }
