export type CatalogExampleAsk = {
  label: string
  query: string
}

/** Handshake and catalog asks. Do not assume seeded weather, FX, or Exa rows. */
export const AE_CATALOG_EXAMPLE_ASKS = [
  { label: 'Search operations', query: 'What admitted operations can I inspect?' },
  { label: 'Connect an agent', query: 'How do I connect an agent to this market?' },
  { label: 'Inspect before call', query: 'How do I inspect an operation before calling it?' },
] as const satisfies readonly CatalogExampleAsk[]
