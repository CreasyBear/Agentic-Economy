import {
  createCurrentToolQuote,
} from '@/modules/capability-supply/current-tool'
import {
  parsePublishedToolSnapshot,
  type PublishedTool,
} from '@/modules/capability-supply/public'

/**
 * The durable Call row already stores the admitted Tool JSON. Its canonical
 * currentDigest is therefore recoverable without another schema field and can
 * be compared with a freshly read current Tool immediately before Provider
 * release.
 */
export function currentToolDigest(input: Readonly<{
  toolRef: string
  tool: PublishedTool
}>): string | undefined {
  try {
    return createCurrentToolQuote(input).currentDigest
  } catch {
    return undefined
  }
}

export function currentToolDigestFromSnapshot(input: Readonly<{
  toolRef: string
  toolJson: string
}>): string | undefined {
  const tool = parsePublishedToolSnapshot(input.toolJson)
  return tool === undefined
    ? undefined
    : currentToolDigest({ toolRef: input.toolRef, tool })
}

export function currentToolQuotesMatch(input: Readonly<{
  toolRef: string
  pinned: PublishedTool
  current: PublishedTool
}>): boolean {
  const pinnedDigest = currentToolDigest({
    toolRef: input.toolRef,
    tool: input.pinned,
  })
  return pinnedDigest !== undefined
    && pinnedDigest === currentToolDigest({
      toolRef: input.toolRef,
      tool: input.current,
    })
}
