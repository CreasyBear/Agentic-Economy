import type { Slug } from '@/modules/common/ids'

export const SeoIndexDirectiveValues = ['index', 'noindex'] as const
export type SeoIndexDirective = (typeof SeoIndexDirectiveValues)[number]

export type PublicBusinessSeoContract = {
  slug: Slug
  title: string
  description: string
  canonicalUrl: string
  indexDirective: SeoIndexDirective
}
