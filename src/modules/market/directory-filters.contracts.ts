import type { X402DirectoryCatalogueInput } from './x402-directory-catalogue'

export type DirectoryExplorerFilterValues = Readonly<
  Pick<
    X402DirectoryCatalogueInput,
    | 'query'
    | 'sort'
    | 'directoryCategory'
    | 'network'
    | 'provider'
    | 'minUsdPrice'
    | 'maxUsdPrice'
    | 'minPayers30d'
    | 'maxPayers30d'
    | 'priceBand'
    | 'adoptionBand'
    | 'curatedOnly'
    | 'hasInputFields'
    | 'hasOutputExample'
    | 'hasInputSchema'
    | 'hasOutputFields'
    | 'hasOutputSchema'
    | 'tags'
    | 'bundleSlugs'
  >
>

/**
 * A filter write that may clear a key by assigning `undefined`.
 * `Partial<>` is not enough under exactOptionalPropertyTypes.
 */
export type DirectoryExplorerFilterPatch = {
  [Key in keyof DirectoryExplorerFilterValues]?: DirectoryExplorerFilterValues[Key] | undefined
}
