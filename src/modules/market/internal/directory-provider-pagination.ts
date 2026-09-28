import type { X402DirectoryEntry } from '../x402-directory'

/** Hosts follow their first appearance in the sorted Tool list. */
export function groupDirectoryProviders(entries: readonly X402DirectoryEntry[]): readonly { provider: string; tools: readonly X402DirectoryEntry[] }[] {
  const groups: { provider: string; tools: X402DirectoryEntry[] }[] = []
  const byProvider = new Map<string, { provider: string; tools: X402DirectoryEntry[] }>()
  for (const entry of entries) {
    const existing = byProvider.get(entry.provider)
    if (existing === undefined) {
      const group = { provider: entry.provider, tools: [entry] }
      byProvider.set(entry.provider, group)
      groups.push(group)
    } else existing.tools.push(entry)
  }
  return groups
}

/** A Tools page and a Providers page both show this many rows. The last page may be shorter. */
export const DIRECTORY_LIST_PAGE_SIZE = 12

/**
 * Walk a sorted Tool stream until `size` new hosts are collected.
 * A host already in `seen` (an earlier page) is skipped.
 * Further Tools for a host on this page stay on this page.
 * The first Tool of the next new host, and everything after it, stays in `rest`.
 */
export function absorbProviderEntries(
  entries: readonly X402DirectoryEntry[],
  carried: readonly { provider: string; tools: readonly X402DirectoryEntry[] }[],
  seen: ReadonlySet<string>,
  size = DIRECTORY_LIST_PAGE_SIZE,
): { groups: { provider: string; tools: X402DirectoryEntry[] }[]; rest: X402DirectoryEntry[] } {
  const groups = carried.map(group => ({ provider: group.provider, tools: [...group.tools] }))
  const byProvider = new Map(groups.map(group => [group.provider, group]))
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry === undefined) continue
    const existing = byProvider.get(entry.provider)
    if (existing !== undefined) {
      existing.tools.push(entry)
      continue
    }
    if (seen.has(entry.provider)) continue
    if (groups.length >= size) return { groups, rest: entries.slice(index) }
    const group = { provider: entry.provider, tools: [entry] }
    byProvider.set(entry.provider, group)
    groups.push(group)
  }
  return { groups, rest: [] }
}
