const WORKSPACE_SUFFIX = /['’]s workspace$/u

/** A stored workspace label is already the name. Do not treat it as a person. */
export function isWorkspaceName(value: string): boolean {
  return WORKSPACE_SUFFIX.test(value.trim())
}

/** Append the workspace suffix once. An existing suffix is left unchanged. */
export function appendWorkspaceSuffix(name: string, apostrophe: "'" | '’' = '’'): string {
  const trimmed = name.trim()
  if (isWorkspaceName(trimmed)) return trimmed
  return `${trimmed}${apostrophe}s workspace`
}

export function unboundWorkspaceDefaultName(input: Readonly<{
  clerkOrgId: string | null
  displayName: string
  ownerDisplayName: string
  clerkPersonName: string | null
}>): string | null {
  if (input.clerkOrgId !== null || !input.displayName.startsWith('user_')) return null
  if (isWorkspaceName(input.ownerDisplayName)) return input.ownerDisplayName.trim()
  const ownerName = input.ownerDisplayName.trim()
  if (ownerName.length > 0 && !ownerName.startsWith('user_')) return appendWorkspaceSuffix(ownerName, "'")
  if (input.clerkPersonName === null) return 'Your workspace'
  if (isWorkspaceName(input.clerkPersonName)) return input.clerkPersonName.trim()
  const person = input.clerkPersonName.trim()
  return person.length > 0 ? appendWorkspaceSuffix(person, "'") : 'Your workspace'
}
