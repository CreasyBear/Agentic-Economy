import { availability } from '@/modules/capability-supply/public'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import type { DirectoryChoice } from '@/modules/market/x402-directory'
import type { Doc } from '../../../_generated/dataModel'
import { env, type QueryCtx } from '../../../_generated/server'
import { getExactRegisteredCapabilityContract } from '../../capabilityContract/documents/reads'
import { capabilitySupplyGraphPorts } from '../../capabilitySupply/graphPorts/ports'
import { toPublicationRow, toPublishedBusiness } from '../../capabilitySupply/graphPorts/rows'
import { toolRecord, toolRecordProjection, type PreloadedCurrentToolRecords } from '../../capabilitySupply/tool/projection'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from '../../../capabilitySupplyRowMappers'
import { directoryListingId } from './ingestion'

/**
 * A row with no current publication is callable by its listing ref, which Quote resolves and
 * publishes, unless the index already named why Quote would refuse it. A row indexed before
 * admission was stored stays callable; Quote decides it.
 */
function unpublishedChoice(row: Doc<'marketDirectorySearchEntries'>): DirectoryChoice {
  const at = row.sourceRouteRef === undefined ? {} : { sourceRouteRef: row.sourceRouteRef }
  if (row.admission?.kind === 'unavailable') return { access: 'unavailable', reason: row.admission.reason, ...at }
  return { access: 'ae_callable', toolRef: row.documentId ?? directoryListingId(row.resource), ...at }
}

/** Exact current publication identity alone never establishes Call readiness. */
export async function currentDirectoryChoice(ctx: QueryCtx, row: Doc<'marketDirectorySearchEntries'>, now: number): Promise<DirectoryChoice> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) return { access: 'unavailable' }
  const sourceRouteRef = row.sourceRouteRef
  if (sourceRouteRef === undefined) return unpublishedChoice(row)
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_sourceRouteRef_and_disposition', q => q.eq('sourceRouteRef', sourceRouteRef).eq('disposition', 'current'))
    .filter(q => q.eq(q.field('runtimeEnvironment'), environment))
    .unique()
  if (publication === null) return unpublishedChoice(row)
  const record = await toolRecord(ctx, publication, now)
  if (record === undefined) return { access: 'unavailable', sourceRouteRef }
  const posture = availability({
    routeable: record.routeable, integrated: record.integrated, readiness: record.readiness,
    ...(record.unavailableReason === undefined ? {} : { unavailableReason: record.unavailableReason }),
  }, now).posture
  return { access: posture === 'routeable' ? 'ae_callable' : posture, sourceRouteRef, toolRef: publication.toolRef }
}

/** Memoize only inside this bounded Convex read; withdrawal is checked on every new read. */
export function choiceForDirectoryPage(ctx: QueryCtx, now: number): (row: Doc<'marketDirectorySearchEntries'>) => Promise<DirectoryChoice> {
  const choices = new Map<string, Promise<DirectoryChoice>>()
  return row => {
    const key = row.sourceRouteRef ?? String(row._id)
    let choice = choices.get(key)
    if (choice === undefined) {
      choice = currentDirectoryChoice(ctx, row, now)
      choices.set(key, choice)
    }
    return choice
  }
}

function loadedToolPorts(
  db: QueryCtx['db'],
  publication: Doc<'capabilityPublications'>,
  offeringDoc: Doc<'capabilityOfferings'> | null,
  bindingDoc: Doc<'capabilityTransportBindings'> | null,
  business: Doc<'businesses'> | null,
  contractResult: PreloadedCurrentToolRecords['contractResult'],
): PreloadedCurrentToolRecords['ports'] {
  const ports = capabilitySupplyGraphPorts(db)
  return {
    ...ports,
    loadPublicationAtRevision: async (publicationRef, revision) => (
      publication.publicationRef === publicationRef && publication.revision === revision
        ? toPublicationRow(publication)
        : ports.loadPublicationAtRevision(publicationRef, revision)
    ),
    loadOfferingByOfferingId: async (offeringId) => (
      offeringDoc?.offeringId === offeringId ? toCapabilityOfferingRow(offeringDoc)
        : offeringId === publication.offeringId ? null
          : ports.loadOfferingByOfferingId(offeringId)
    ),
    loadBindingByBindingId: async (bindingId) => (
      bindingDoc?.bindingId === bindingId ? toCapabilityBindingRow(bindingDoc)
        : bindingId === publication.bindingId ? null
          : ports.loadBindingByBindingId(bindingId)
    ),
    loadPublishedBusiness: async (businessId) => {
      if (business !== null && String(business._id) === businessId) {
        return business.publicStatus === 'published' && business.suppressedAt === undefined ? toPublishedBusiness(business) : null
      }
      return ports.loadPublishedBusiness(businessId)
    },
    getExactRegisteredCapabilityContract: async (ref) => (
      ref.capabilityId === publication.capabilityId && ref.version === publication.version && ref.contractDigest === publication.contractDigest
        ? contractResult
        : ports.getExactRegisteredCapabilityContract(ref)
    ),
  }
}

/** One indexed read per distinct publication, offering, binding, business and contract on the page. */
export async function choicesForDirectoryRows(
  ctx: QueryCtx,
  rows: readonly Doc<'marketDirectorySearchEntries'>[],
  now: number,
): Promise<Map<string, DirectoryChoice>> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) return new Map(rows.map(row => [row.sourceRouteRef ?? String(row._id), { access: 'unavailable' }]))
  const refs = [...new Set(rows.flatMap(row => row.sourceRouteRef === undefined ? [] : [row.sourceRouteRef]))]
  const publications = await Promise.all(refs.map(sourceRouteRef => ctx.db.query('capabilityPublications')
    .withIndex('by_sourceRouteRef_and_disposition', query => query.eq('sourceRouteRef', sourceRouteRef).eq('disposition', 'current'))
    .filter(query => query.eq(query.field('runtimeEnvironment'), environment))
    .unique()))
  const joined = refs.flatMap((sourceRouteRef, index) => {
    const publication = publications[index]
    return publication == null ? [] : [{ sourceRouteRef, publication }]
  })
  const [offeringDocs, bindingDocs, businesses, contracts] = await Promise.all([
    Promise.all(joined.map(({ publication }) => ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', query => query.eq('offeringId', publication.offeringId)).unique())),
    Promise.all(joined.map(({ publication }) => ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', query => query.eq('bindingId', publication.bindingId)).unique())),
    Promise.all(joined.map(({ publication }) => ctx.db.get(publication.businessId))),
    Promise.all(joined.map(({ publication }) => getExactRegisteredCapabilityContract(ctx.db, {
      capabilityId: publication.capabilityId, version: publication.version, contractDigest: publication.contractDigest,
    }))),
  ])
  const byRef = new Map<string, DirectoryChoice>()
  await Promise.all(joined.map(async ({ sourceRouteRef, publication }, index) => {
    const offeringDoc = offeringDocs[index] ?? null
    const bindingDoc = bindingDocs[index] ?? null
    const business = businesses[index] ?? null
    const contractResult = contracts[index]
    if (contractResult === undefined) {
      byRef.set(sourceRouteRef, { access: 'unavailable', sourceRouteRef })
      return
    }
    const projection = await toolRecordProjection(ctx, publication, now, {
      offeringDoc, bindingDoc, business, contractResult,
      ports: loadedToolPorts(ctx.db, publication, offeringDoc, bindingDoc, business, contractResult),
    })
    if (projection.kind !== 'projected') {
      byRef.set(sourceRouteRef, { access: 'unavailable', sourceRouteRef })
      return
    }
    const posture = availability({
      routeable: projection.record.routeable, integrated: projection.record.integrated, readiness: projection.record.readiness,
      ...(projection.record.unavailableReason === undefined ? {} : { unavailableReason: projection.record.unavailableReason }),
    }, now).posture
    byRef.set(sourceRouteRef, { access: posture === 'routeable' ? 'ae_callable' : posture, sourceRouteRef, toolRef: publication.toolRef })
  }))
  return new Map(rows.map(row => [
    row.sourceRouteRef ?? String(row._id),
    (row.sourceRouteRef === undefined ? undefined : byRef.get(row.sourceRouteRef)) ?? unpublishedChoice(row),
  ]))
}
