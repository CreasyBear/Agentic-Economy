import { brandNonEmpty, type Slug } from '@/modules/common/ids'
import { normalizeSlug } from '@/modules/common/normalize-slug'

export function parseBusinessSlug(value: string):
  | Readonly<{ kind: 'valid'; slug: Slug }>
  | Readonly<{ kind: 'malformed' }> {
  return value.length > 0 && normalizeSlug(value) === value
    ? { kind: 'valid', slug: brandNonEmpty(value, 'Slug') }
    : { kind: 'malformed' }
}
