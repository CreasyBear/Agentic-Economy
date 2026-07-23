export type CatalogGroundedProvider = {
  slug: string
}

export type CatalogGroundedAnswer = {
  providers: readonly CatalogGroundedProvider[]
  offeringSources?: readonly { business: CatalogGroundedProvider }[]
}

export type CatalogGroundingInput = {
  providers: readonly CatalogGroundedProvider[]
  offeringSources?: readonly { business: CatalogGroundedProvider }[]
  allowedSlugs: ReadonlySet<string>
}

export function validateCatalogGrounding(input: CatalogGroundingInput): boolean {
  return input.providers.every((provider) => input.allowedSlugs.has(provider.slug))
    && (input.offeringSources ?? []).every((source) => input.allowedSlugs.has(source.business.slug))
}

export function collectAllowedSlugsFromToolResults(toolResults: readonly { slug: string }[][]): ReadonlySet<string> {
  const slugs = new Set<string>()
  for (const batch of toolResults) {
    for (const provider of batch) {
      slugs.add(provider.slug)
    }
  }
  return slugs
}

export function sanitizeStructuredAnswer<TAnswer extends CatalogGroundedAnswer>(
  answer: TAnswer,
  allowedSlugs: ReadonlySet<string>,
): TAnswer | undefined {
  if (!validateCatalogGrounding({
    providers: answer.providers,
    ...(answer.offeringSources === undefined ? {} : { offeringSources: answer.offeringSources }),
    allowedSlugs,
  })) {
    return undefined
  }
  return answer
}
