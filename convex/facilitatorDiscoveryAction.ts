"use node"

import { v } from 'convex/values'
import {
  extractDiscoveryInfoFromExtension,
  validateAndExtract,
  type DiscoveryExtension,
} from '@x402/extensions/bazaar'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { fetchFacilitatorDiscoveryPages } from '@/modules/capability-supply/server'
import { importX402Capability } from '@/modules/capability-supply/internal/publication-importer-x402'
import {
  admitBazaarDiscoveryInfo,
  type BazaarAdmission,
} from '@/modules/capability-supply/internal/publication-importer-x402-bazaar'
import {
  admittedFacilitatorDiscoveryDraft,
  decideFacilitatorDiscoveryItem,
  FACILITATOR_DISCOVERY_MAX_PAGE_SIZE,
  mapFacilitatorDiscoveryImporterRefusal,
  paymentRequiredFromDiscoveryItem,
  type FacilitatorDiscoveryAdmittedDraft,
  type FacilitatorDiscoveryAdmissionResult,
  type FacilitatorDiscoverySkip,
} from '@/modules/capability-supply/internal/facilitator-discovery-ingest'
import type { CapabilityPublicationImport } from '@/modules/capability-supply/internal/publication-importer-types'
import { isRecord } from '@/modules/common/is-record'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

export async function admitFacilitatorDiscoveryItems(
  items: readonly unknown[],
): Promise<FacilitatorDiscoveryAdmissionResult> {
  const admitted: FacilitatorDiscoveryAdmittedDraft[] = []
  const skipped: FacilitatorDiscoverySkip[] = []
  for (const item of items.slice(0, FACILITATOR_DISCOVERY_MAX_PAGE_SIZE)) {
    const paymentRequired = paymentRequiredFromDiscoveryItem(item)
    if (paymentRequired === undefined) {
      skipped.push({ kind: 'skip', reason: 'resource_invalid' })
      continue
    }
    const bazaar = admitOfficialBazaar(paymentRequired)
    const decision = decideFacilitatorDiscoveryItem(item, bazaar)
    if (decision.kind === 'skip') {
      skipped.push(decision)
      continue
    }
    const sourceRevision = `facilitator-discovery:v1:${canonicalDigest({
      route: {
        method: decision.identity.method,
        resourceUrl: decision.identity.origin + decision.identity.path,
      },
      source: JSON.stringify(decision.import),
    }).slice(7)}`
    const sourceImport = withoutRawBazaarPaymentRequired(decision.import)
    let result
    try {
      result = await importX402Capability(sourceImport)
    } catch {
      skipped.push({ kind: 'skip', reason: 'source_invalid' })
      continue
    }
    if (result.kind !== 'normalized') {
      skipped.push({
        kind: 'skip',
        reason: mapFacilitatorDiscoveryImporterRefusal(result.reason),
      })
      continue
    }
    admitted.push(admittedFacilitatorDiscoveryDraft(
      result.draft,
      { ...decision, import: sourceImport },
      sourceRevision,
    ))
  }
  if (items.length > FACILITATOR_DISCOVERY_MAX_PAGE_SIZE) {
    skipped.push({ kind: 'skip', reason: 'resource_invalid' })
  }
  return { admitted, skipped }
}

function admitOfficialBazaar(
  paymentRequired: Readonly<Record<string, unknown>>,
): BazaarAdmission {
  const extensions = paymentRequired.extensions
  const extension = isRecord(extensions) ? extensions.bazaar : undefined
  if (extension === undefined) {
    return { kind: 'absent' }
  }
  if (!isRecord(extension)) {
    return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
  }
  const discoveryExtension = extension as unknown as DiscoveryExtension
  try {
    const validation = validateAndExtract(discoveryExtension)
    if (!validation.valid) {
      return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
    }
    const info = extractDiscoveryInfoFromExtension(discoveryExtension, false)
    return admitBazaarDiscoveryInfo(extension, {
      input: info.input as Readonly<Record<string, unknown>>,
      output: info.output,
    })
  } catch {
    return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
  }
}

function withoutRawBazaarPaymentRequired(
  input: Extract<CapabilityPublicationImport, { kind: 'x402' }>,
): Extract<CapabilityPublicationImport, { kind: 'x402' }> {
  if (!isRecord(input.resource) || !Object.hasOwn(input.resource, 'paymentRequired')) {
    return input
  }
  const { paymentRequired: _paymentRequired, ...resource } = input.resource
  return { ...input, resource }
}

export const run = internalAction({
  args: {},
  returns: v.object({ pages: v.number(), admitted: v.number(), complete: v.boolean() }),
  handler: async (ctx) => {
    const deadlineAt = Date.now() + 120_000
    const fetched = await fetchFacilitatorDiscoveryPages({
      jobTimeoutMs: Math.max(0, deadlineAt - Date.now()),
    })
    const seenPublicationRefs = new Set<string>()
    let admitted = 0
    let complete = fetched.complete && Date.now() < deadlineAt
    let deadlineExceeded = Date.now() >= deadlineAt
    for (const fetchedPage of fetched.pages) {
      if (Date.now() >= deadlineAt) {
        complete = false
        deadlineExceeded = true
        break
      }
      if (Date.now() >= deadlineAt) {
        complete = false
        deadlineExceeded = true
        break
      }
      const admission = await admitFacilitatorDiscoveryItems(fetchedPage.page.items)
      const result = await ctx.runMutation(internal.facilitatorDiscovery.reconcile, {
        items: [...admission.admitted],
        complete: false,
        deadlineAt,
      })
      admitted += result.admitted
      for (const publicationRef of result.seenPublicationRefs) {
        seenPublicationRefs.add(publicationRef)
      }
      if (result.deadlineExceeded) {
        complete = false
        deadlineExceeded = true
        break
      }
    }
    if (!deadlineExceeded && Date.now() < deadlineAt) {
      const result = await ctx.runMutation(internal.facilitatorDiscovery.reconcile, {
        items: [],
        complete,
        seenPublicationRefs: [...seenPublicationRefs].sort(),
        deadlineAt,
      })
      if (result.deadlineExceeded) complete = false
    } else {
      complete = false
    }
    return { pages: fetched.pages.length, admitted, complete }
  },
})
