import type { PublicOfferingDto } from '@/modules/registry/public'

export function offeringPathLabel(path: PublicOfferingDto['accessPaths'][number]): string {
  if (path.kind === 'external_operation') return path.name
  switch (path.channel) {
    case 'ae_inquiry':
      return 'AE inquiry'
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
