/**
 * Pure page-stack state machine for the operator command panel.
 *
 * The panel is a stacked router: the root layer is always the operations
 * search page and inspect layers are pushed on top. Closing the panel never
 * touches the stack, so a Cmd-k flicker cannot discard an in-flight lookup;
 * only an Escape on the last remaining layer requests a close, and only a
 * completed navigation resets the stack.
 */

export type CommandPanelPage =
  | Readonly<{ kind: 'operations-search' }>
  | Readonly<{ kind: 'operation-inspect'; operationRef: string }>

export type CommandPanelStack = readonly [CommandPanelPage, ...CommandPanelPage[]]

/** Hard stop so a misbehaving consumer cannot grow the stack forever. */
const MAX_STACK_DEPTH = 8

export const initialCommandPanelPages: CommandPanelStack = [{ kind: 'operations-search' }]

/**
 * Top of the deck: the most recently pushed inspect layer, or the mandatory
 * root search page when no layer sits above it. The machine owns this view so
 * consumers never index past the guaranteed root.
 */
export function topCommandPanelPage(pages: CommandPanelStack): CommandPanelPage {
  const [root, ...layers] = pages
  const top = layers[layers.length - 1]
  return top === undefined ? root : top
}

export function pushCommandPanelPage(
  pages: CommandPanelStack,
  page: CommandPanelPage,
): CommandPanelStack {
  if (pages.length >= MAX_STACK_DEPTH) return pages
  return [...pages, page] as CommandPanelStack
}

/**
 * Pops exactly one layer. Reaching the root through Escape asks the host to
 * close the panel instead of leaving an empty deck behind.
 */
export function popCommandPanelPage(
  pages: CommandPanelStack,
): Readonly<{ pages: CommandPanelStack; closeRequested: boolean }> {
  if (pages.length <= 1) {
    return { pages: initialCommandPanelPages, closeRequested: true }
  }
  // length > 1, so the popped deck still holds at least the root layer.
  const [root, ...rest] = pages.slice(0, -1)
  if (root === undefined) {
    return { pages: initialCommandPanelPages, closeRequested: true }
  }
  return { pages: [root, ...rest], closeRequested: false }
}
