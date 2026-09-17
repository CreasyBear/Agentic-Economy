import type { BusinessRecord } from '@/modules/business/public'

export function isPubliclyDiscoverable(
  business: Pick<BusinessRecord, 'publicStatus' | 'suppressedAt'> | undefined,
): boolean {
  return business?.publicStatus === 'published' && business.suppressedAt === undefined
}
