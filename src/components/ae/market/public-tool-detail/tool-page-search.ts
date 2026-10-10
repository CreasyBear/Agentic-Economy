/** Tool page state kept in the URL, so a tab deep-links and sign-in returns to the same input. */
const TOOL_PAGE_TABS = ['try', 'schema', 'sample'] as const
export type ToolPageTab = typeof TOOL_PAGE_TABS[number]

export const TOOL_INPUT_SEARCH_LIMIT = 2_000

/** `input` is the changed request as a JSON object, so the URL carries it once-encoded. */
export type ToolPageSearch = Readonly<{ tab?: ToolPageTab; input?: Readonly<Record<string, unknown>> }>
export type ToolPageSearchChange = (next: ToolPageSearch) => void

function isToolPageTab(value: unknown): value is ToolPageTab {
  return TOOL_PAGE_TABS.some(tab => tab === value)
}

function boundedInput(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const json = JSON.stringify(value)
  return json.length > TOOL_INPUT_SEARCH_LIMIT ? undefined : value as Record<string, unknown>
}

export function validateToolPageSearch(search: Record<string, unknown>): ToolPageSearch {
  const input = boundedInput(search.input)
  return {
    ...(isToolPageTab(search.tab) ? { tab: search.tab } : {}),
    ...(input === undefined ? {} : { input }),
  }
}
