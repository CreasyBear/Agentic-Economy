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
