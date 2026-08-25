import type { BusinessRecord } from '@/modules/business/public'

export function isPubliclyDiscoverable(
  business: Pick<BusinessRecord, 'publicStatus'> | undefined,
): boolean {
  return business?.publicStatus === 'published'
}
