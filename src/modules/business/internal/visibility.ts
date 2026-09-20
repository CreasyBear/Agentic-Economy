import type { BusinessRecord } from './business-record'

export function isPubliclyDiscoverable(
  business: Pick<BusinessRecord, 'publicStatus' | 'suppressedAt'> | undefined,
): boolean {
  return business?.publicStatus === 'published' && business.suppressedAt === undefined
}
