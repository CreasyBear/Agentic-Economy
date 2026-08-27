import { v } from 'convex/values'

import {
  isPublicOperationRef,
  parseAdmittedTransportCatalogMetadata,
  parseAdmittedX402CatalogPayment,
  projectCapabilityOperationCatalogPrice,
  projectCapabilityOperationParameters,
  MAX_ELIGIBLE_SUPPLY,
  type CatalogOfferingOperationMapEntry,
} from '@/modules/capability-supply/public'

import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import {
  operationRecord,
  publicAuthentication,
  publicAuthenticationFor,
} from './capabilitySupplyOperationShared'

/**
 * W1 origin seam: one exact admitted capability-operation entry per catalog
 * access path. Entries deliberately carry only public lineage, transport and
 * readiness facts; credential references/configuration never cross this query.
 */
const publicCatalogPrice = v.object({
  scheme: v.union(v.literal('exact'), v.literal('upto')),
  amount: v.optional(v.string()),
  minAmount: v.optional(v.string()),
  maxAmount: v.optional(v.string()),
  currency: v.string(),
})
const publicPayment = v.object({
  network: v.string(),
  asset: v.string(),
  currency: v.string(),
  routeAmountExponent: v.number(),
  assetAmountExponent: v.number(),
})
const publicParameter = v.object({
  group: v.union(v.literal('body'), v.literal('path'), v.literal('query'), v.literal('header')),
  name: v.string(),
  type: v.string(),
  description: v.optional(v.string()),
  example: v.optional(v.any()), // runtime-validated JsonValue boundary
  enumValues: v.optional(v.array(v.string())),
  default: v.optional(v.any()), // runtime-validated JsonValue boundary
  required: v.boolean(),
  style: v.optional(v.union(v.literal('form'), v.literal('simple'))),
  explode: v.optional(v.boolean()),
})
const publicReadiness = v.object({
  observedAt: v.optional(v.number()),
  validUntil: v.optional(v.number()),
})
export const offeringOperationMapReturns = v.array(v.object({
  offeringRef: v.string(),
  offeringRevision: v.number(),
  offeringSourceHash: v.string(),
  declaredAccessPathRef: v.string(),
  accessPathSourceHash: v.string(),
  endpointUrl: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  authorityMode: v.union(
    v.literal('provider_owned'),
    v.literal('ae_curated_external'),
    v.literal('third_party_gateway'),
    v.literal('observed_external'),
  ),
  sourceKind: v.union(
    v.literal('ae_envelope'),
    v.literal('openapi_http'),
    v.literal('mcp'),
    v.literal('agent_plugin_mcp'),
    v.literal('x402'),
  ),
  authentication: publicAuthentication,
  routeable: v.boolean(),
  readiness: publicReadiness,
  operationRef: v.string(),
  parameters: v.optional(v.array(publicParameter)),
  catalogPrice: v.optional(publicCatalogPrice),
  payment: v.optional(publicPayment),
}))

export async function offeringOperationMapHandler(
  ctx: QueryCtx,
  args: { businessIds: string[] },
) {
  const entries = await buildOfferingOperationMap(ctx, args.businessIds, Date.now())
  return entries.map((entry) => ({
    offeringRef: entry.offeringRef,
    offeringRevision: entry.offeringRevision,
    offeringSourceHash: entry.offeringSourceHash,
    declaredAccessPathRef: entry.declaredAccessPathRef,
    accessPathSourceHash: entry.accessPathSourceHash,
    endpointUrl: entry.endpointUrl,
    method: entry.method,
    authorityMode: entry.authorityMode,
    sourceKind: entry.sourceKind,
    authentication: entry.authentication,
    routeable: entry.routeable,
    readiness: {
      ...(entry.readiness.observedAt === undefined ? {} : { observedAt: entry.readiness.observedAt }),
      ...(entry.readiness.validUntil === undefined ? {} : { validUntil: entry.readiness.validUntil }),
    },
    operationRef: entry.operationRef,
    ...(entry.parameters === undefined
      ? {}
      : {
          parameters: entry.parameters.map((parameter) => ({
            group: parameter.group,
            name: parameter.name,
            type: parameter.type,
            ...(parameter.description === undefined ? {} : { description: parameter.description }),
            ...(parameter.example === undefined ? {} : { example: parameter.example }),
            ...(parameter.enumValues === undefined ? {} : { enumValues: [...parameter.enumValues] }),
            ...(parameter.default === undefined ? {} : { default: parameter.default }),
            required: parameter.required,
            ...(parameter.style === undefined ? {} : { style: parameter.style }),
            ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
          })),
        }),
    ...(entry.catalogPrice === undefined
      ? {}
      : {
          catalogPrice: {
            scheme: entry.catalogPrice.scheme,
            ...(entry.catalogPrice.amount === undefined ? {} : { amount: entry.catalogPrice.amount }),
            ...(entry.catalogPrice.minAmount === undefined ? {} : { minAmount: entry.catalogPrice.minAmount }),
            ...(entry.catalogPrice.maxAmount === undefined ? {} : { maxAmount: entry.catalogPrice.maxAmount }),
            currency: entry.catalogPrice.currency,
          },
        }),
    ...(entry.payment === undefined
      ? {}
      : {
          payment: {
            network: entry.payment.network,
            asset: entry.payment.asset,
            currency: entry.payment.currency,
            routeAmountExponent: entry.payment.routeAmountExponent,
            assetAmountExponent: entry.payment.assetAmountExponent,
          },
        }),
  }))
}

async function buildOfferingOperationMap(
  ctx: QueryCtx,
  businessIds: readonly string[],
  now: number,
): Promise<CatalogOfferingOperationMapEntry[]> {
  if (businessIds.length === 0) return []
  const entries: CatalogOfferingOperationMapEntry[] = []
  for (const businessId of businessIds) {
    const publications = await ctx.db.query('capabilityPublications')
      .withIndex('by_businessId_and_disposition', (query) => (
        query.eq('businessId', businessId as Id<'businesses'>).eq('disposition', 'current')
      ))
      .take(MAX_ELIGIBLE_SUPPLY + 1)
    if (publications.length > MAX_ELIGIBLE_SUPPLY) continue
    for (const publication of publications) {
      const [offeringDoc, bindingDoc] = await Promise.all([
        ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
          .unique(),
        ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
          .unique(),
      ])
      const origin = offeringDoc?.origin
      if (
        origin?.kind !== 'catalog_offering'
        || origin.offeringSourceHash === undefined
        || origin.declaredAccessPathRef === undefined
        || origin.accessPathSourceHash === undefined
      ) continue
      const record = await operationRecord(ctx, publication, now)
      if (record === undefined || !record.integrated || bindingDoc === null) continue
      if (!isPublicOperationRef(publication.operationRef)) continue
      if (
        record.offering.offeringRef !== origin.offeringRef
        || record.offering.revision !== origin.offeringRevision
      ) continue
      const transport = parseAdmittedTransportCatalogMetadata(bindingDoc.adapterId, bindingDoc.configJson)
      if (transport === undefined) continue
      const parameters = projectCapabilityOperationParameters(record)
      const catalogPrice = projectCapabilityOperationCatalogPrice(record)
      const exactRouteable = record.routeable
      const payment = bindingDoc.admission !== 'admitted' || bindingDoc.conformance !== 'conformant'
        ? undefined
        : parseAdmittedX402CatalogPayment(bindingDoc.adapterId, bindingDoc.configJson)
      const queryPointers = new Set(transport.queryInputPointers)
      const projectedParameters = parameters?.map((parameter) => ({
        ...parameter,
        group: queryPointers.has(`/${parameter.name.replace(/~/g, '~0').replace(/\//g, '~1')}`)
          ? 'query' as const
          : parameter.group,
      }))
      entries.push({
        offeringRef: origin.offeringRef,
        offeringRevision: origin.offeringRevision,
        offeringSourceHash: origin.offeringSourceHash,
        declaredAccessPathRef: origin.declaredAccessPathRef,
        accessPathSourceHash: origin.accessPathSourceHash,
        endpointUrl: bindingDoc.endpointUrl,
        method: transport.method,
        authorityMode: record.provenance.publisher,
        sourceKind: record.provenance.sourceKind,
        authentication: publicAuthenticationFor(bindingDoc.authority, record.provenance.sourceKind, bindingDoc.adapterId, bindingDoc.configJson),
        routeable: exactRouteable,
        readiness: record.readiness,
        operationRef: publication.operationRef,
        ...(projectedParameters === undefined ? {} : { parameters: projectedParameters }),
        ...(catalogPrice === undefined ? {} : { catalogPrice }),
        ...(payment === undefined ? {} : { payment }),
      })
    }
  }
  return entries.sort((left, right) => (
    left.offeringRef.localeCompare(right.offeringRef)
    || left.declaredAccessPathRef.localeCompare(right.declaredAccessPathRef)
    || left.operationRef.localeCompare(right.operationRef)
  ))
}

