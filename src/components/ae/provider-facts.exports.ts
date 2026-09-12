import type { PublicListingDto } from '@/modules/registry/public'

export function offeringPathLabel(path: PublicListingDto['accessPaths'][number]): string {
  if (path.kind === 'external_operation') return path.name
  switch (path.channel) {
    case 'phone':
      return 'Phone'
    case 'website':
      return 'Website'
    default: {
      const _exhaustive: never = path.channel
      return _exhaustive
    }
  }
}
