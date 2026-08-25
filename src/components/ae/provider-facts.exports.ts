import type { PublicOfferingDto } from '@/modules/registry/public'

export function offeringPathLabel(path: PublicOfferingDto['accessPaths'][number]): string {
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
