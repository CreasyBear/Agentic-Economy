/**
 * The one next step a caller should take after a Tool search: page into
 * more results, remember a job with no current match, broaden a filtered
 * search with no current match, or stop. A pure decision so the CLI can
 * render it as a shell continuation (`tools/ae/lib/continuation-command.ts`)
 * and MCP can hand it back as structured data, from the same source of truth.
 */
export type ToolSearchNextActionInput = Readonly<{
  kind: 'ok' | 'no_candidates'
  query: string
  pagination: Readonly<{ nextCursor?: string | undefined; hasMore: boolean }>
  hasFilters: boolean
}>

export type ToolSearchNextAction =
  | Readonly<{ kind: 'next_page'; cursor: string }>
  | Readonly<{ kind: 'request'; query: string }>
  | Readonly<{ kind: 'broaden' }>
  | Readonly<{ kind: 'none' }>

export function nextAction(input: ToolSearchNextActionInput): ToolSearchNextAction {
  const { pagination } = input
  if (pagination.hasMore && pagination.nextCursor !== undefined) {
    return { kind: 'next_page', cursor: pagination.nextCursor }
  }
  const exhausted = pagination.hasMore !== true
  if (exhausted && input.kind === 'no_candidates' && input.query.length > 0) {
    return input.hasFilters ? { kind: 'broaden' } : { kind: 'request', query: input.query }
  }
  return { kind: 'none' }
}
