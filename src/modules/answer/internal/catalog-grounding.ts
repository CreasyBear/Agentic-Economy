import type { AeAnswerArtifacts } from '../answer-schema'

export type CatalogGroundingInput = {
  providers: readonly { slug: string }[]
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

export function sanitizeStructuredAnswer(
  answer: AeAnswerArtifacts,
  allowedSlugs: ReadonlySet<string>,
): AeAnswerArtifacts | undefined {
  if (!validateCatalogGrounding({ providers: answer.providers, allowedSlugs })) {
    return undefined
  }
  return answer
}
