import slugify from '@sindresorhus/slugify'

const CANONICAL_SLUG_MAX_LENGTH = 72

/** Canonical slugs delegate to the shared library, then apply a 72-character cap and trailing-dash removal. */
export function normalizeSlug(value: string): string {
  return slugify(value)
    .slice(0, CANONICAL_SLUG_MAX_LENGTH)
    .replace(/-+$/, '')
}
