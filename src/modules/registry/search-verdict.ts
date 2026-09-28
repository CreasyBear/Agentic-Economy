export const SEARCH_ASSESSMENT_LIMIT = 20
export const SEARCH_MATCH_SCORE = 0.5

export function suitableRankedToolRefs(ranking: readonly Readonly<{ toolRef: string; score: number }>[]): string[] {
  return ranking.filter(({ score }) => score >= SEARCH_MATCH_SCORE).map(({ toolRef }) => toolRef)
}

export type SearchVerdict = 'match' | 'scoped' | 'noMatch' | 'unavailable'

/** An empty page is a no-match only when the eligible inventory was fully assessed. */
export function searchVerdict(input: Readonly<{
  matches: number
  assessedComplete: boolean
  available: boolean
}>): SearchVerdict {
  if (!input.available) return 'unavailable'
  if (input.matches > 0) return 'match'
  return input.assessedComplete ? 'noMatch' : 'scoped'
}
