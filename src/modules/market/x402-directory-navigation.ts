/** URL-facing catalogue filters shared by navigation and return links. */
export const directoryCatalogueSearchKeys = [
  'query', 'offset', 'directoryCategory', 'indexCursor', 'sort',
  'network', 'provider', 'minUsdPrice', 'maxUsdPrice', 'priceBand', 'adoptionBand', 'minPayers30d', 'maxPayers30d',
  'curatedOnly', 'tags', 'bundleSlugs', 'hasInputFields', 'hasOutputFields',
  'hasInputSchema', 'hasOutputSchema', 'hasOutputExample',
] as const

export const directoryBooleanSearchKeys = [
  'curatedOnly', 'hasInputFields', 'hasOutputFields', 'hasInputSchema',
  'hasOutputSchema', 'hasOutputExample',
] as const

export const directoryArraySearchKeys = ['tags', 'bundleSlugs'] as const

export function directoryCatalogueSearchValues<T extends Readonly<Record<string, unknown>>>(search: T): Partial<Pick<T, Extract<(typeof directoryCatalogueSearchKeys)[number], keyof T>>> {
  return Object.fromEntries(directoryCatalogueSearchKeys.flatMap(key => search[key] === undefined ? [] : [[key, search[key]]])) as Partial<Pick<T, Extract<(typeof directoryCatalogueSearchKeys)[number], keyof T>>>
}
