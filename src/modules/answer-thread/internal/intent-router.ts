import type { FollowUpIntent } from '../answer-thread.schema'

/**
 * Deterministic routing for the tool-led answer turn.
 *
 * The follow-up intent decides whether the turn runs a fresh catalog search,
 * reuses frozen prior evidence, or answers from boundary copy with no LLM call
 * at all. Routing is exhaustive over `FollowUpIntent` so a newly added variant
 * is a compile-time error until handled here.
 *
 * - `refine_search` → `tool_search`: the only route that exposes registry
 *   tools to the agent. Misspelling recovery happens here, when the model
 *   chooses better `registry.search` arguments.
 * - `filter_known` / `compare_known` → frozen-evidence routes: the agent
 *   writes prose over frozen prior providers with `disableTools`, and the gate
 *   uses the frozen `allowedSlugs`. No new catalog search.
 * - `explain_boundary` / `unsupported` → boundary-prose routes: deterministic
 *   copy from `boundary-prose.ts`, no LLM call, no tools.
 */
export type IntentRoute =
  | { kind: 'tool_search' }
  | { kind: 'frozen_filter' }
  | { kind: 'frozen_compare' }
  | { kind: 'boundary_explain' }
  | { kind: 'unsupported' }

export function resolveIntentRoute(intent: FollowUpIntent): IntentRoute {
  switch (intent) {
    case 'refine_search':
      return { kind: 'tool_search' }
    case 'filter_known':
      return { kind: 'frozen_filter' }
    case 'compare_known':
      return { kind: 'frozen_compare' }
    case 'explain_boundary':
      return { kind: 'boundary_explain' }
    case 'unsupported':
      return { kind: 'unsupported' }
  }
}

/** True only for the route that exposes registry tools to the agent. */
export function routeCallsTools(route: IntentRoute): boolean {
  return route.kind === 'tool_search'
}

/** True for routes that answer from boundary copy with no LLM call. */
export function routeIsBoundary(route: IntentRoute): boolean {
  return route.kind === 'boundary_explain' || route.kind === 'unsupported'
}
