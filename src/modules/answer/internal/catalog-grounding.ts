export type CatalogGroundedProvider = {
  slug: string
}

export type CatalogGroundedAnswer = {
  providers: readonly CatalogGroundedProvider[]
}

export type CatalogGroundingInput = {
  providers: readonly CatalogGroundedProvider[]
  allowedSlugs: ReadonlySet<string>
}

export function validateCatalogGrounding(input: CatalogGroundingInput): boolean {
  if (input.providers.length === 0) {
    return true
  }
  return input.providers.every((provider) => input.allowedSlugs.has(provider.slug))
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
  if (!validateCatalogGrounding({ providers: answer.providers, allowedSlugs })) {
    return undefined
  }
  return answer
}
