import type { admitFacilitatorDiscoveryItems } from '@/modules/capability-supply/server'

type FacilitatorDiscoveryAdmittedItems =
  Awaited<ReturnType<typeof admitFacilitatorDiscoveryItems>>['admitted']

/**
 * Admitted facilitator-discovery drafts carry a Zod-optional
 * `offering.presentation.price` (`price?: X | undefined`), while the Convex
 * validator's optional field excludes `undefined` from the value type
 * (`Exclude<Infer<T>, undefined>`). Passing an item through untouched fails
 * `exactOptionalPropertyTypes` whenever the price is absent, so drop the key
 * entirely instead of carrying it as an explicit `undefined`.
 */
export function reconcileReadyItems(items: FacilitatorDiscoveryAdmittedItems) {
  return items.map((item) => {
    const { price, ...presentationRest } = item.offering.presentation
    return {
      ...item,
      offering: {
        ...item.offering,
        presentation: price === undefined ? presentationRest : { ...presentationRest, price },
      },
    }
  })
}

export const RECONCILE_CHUNK_SIZE = 100

/** Applies items in bounded mutation calls (the reconcile mutation rejects more than 100 per call). */
export async function reconcileInChunks<T, R>(items: readonly T[], apply: (chunk: T[]) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let index = 0; index < items.length; index += RECONCILE_CHUNK_SIZE) {
    results.push(await apply(items.slice(index, index + RECONCILE_CHUNK_SIZE)))
  }
  return results
}
