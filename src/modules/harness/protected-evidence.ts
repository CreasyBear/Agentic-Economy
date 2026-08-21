import type { HarnessToolResult } from './harness.schema'

export type HarnessEvidenceSensitivity = 'public' | 'private' | 'protectedPrivate'

export type HarnessProtectedEvidenceKind =
  | 'sourceFact'
  | 'catalogDto'
  | 'gateDecision'
  | 'modelMessage'
  | 'rawToolMessage'

export type HarnessProtectedToolContext = {
  readonly toolResult: Pick<HarnessToolResult, 'toolId' | 'toolCallId' | 'status'>
  readonly toolCall?: {
    readonly id?: string
    readonly name?: string
    readonly arguments?: unknown
  }
}

export type HarnessProtectedToolMatcher =
  | string
  | ((context: HarnessProtectedToolContext) => boolean)

export const AE_PROTECTED_TOOL_IDS = [
  'registry.search',
  'registry.detail',
] as const

const PROTECTED_EVIDENCE_KINDS: readonly HarnessProtectedEvidenceKind[] = [
  'sourceFact',
  'catalogDto',
  'gateDecision',
  'modelMessage',
  'rawToolMessage',
]

export function classifyHarnessEvidenceSensitivity(input: {
  sensitivity?: HarnessEvidenceSensitivity
  kind?: HarnessProtectedEvidenceKind | 'publicSummary'
  toolId?: string
  protected?: boolean
}): HarnessEvidenceSensitivity {
  if (input.sensitivity !== undefined) {
    return input.sensitivity
  }

  if (input.protected === true) {
    return 'protectedPrivate'
  }

  if (input.kind !== undefined && isProtectedEvidenceKind(input.kind)) {
    return 'protectedPrivate'
  }

  if (input.toolId !== undefined && isAeProtectedToolId(input.toolId)) {
    return 'protectedPrivate'
  }

  return input.kind === 'publicSummary' ? 'public' : 'private'
}

export function isAeProtectedToolId(toolId: string): toolId is (typeof AE_PROTECTED_TOOL_IDS)[number] {
  return (AE_PROTECTED_TOOL_IDS as readonly string[]).includes(toolId)
}

export function isRegistrySearchToolResult(context: HarnessProtectedToolContext): boolean {
  return context.toolResult.toolId === 'registry.search'
}

export function isRegistryDetailToolResult(context: HarnessProtectedToolContext): boolean {
  return context.toolResult.toolId === 'registry.detail'
}

export function isProtectedAeToolResult(
  toolResult: Pick<HarnessToolResult, 'toolId' | 'toolCallId' | 'status'>,
  toolCall: HarnessProtectedToolContext['toolCall'] | undefined = undefined,
  matchers: readonly HarnessProtectedToolMatcher[] = AE_PROTECTED_TOOL_IDS,
): boolean {
  const context: HarnessProtectedToolContext = { toolResult, ...(toolCall === undefined ? {} : { toolCall }) }

  for (const matcher of matchers) {
    if (typeof matcher === 'string') {
      if (toolResult.toolId === matcher) {
        return true
      }
      continue
    }

    if (matcher(context)) {
      return true
    }
  }

  return false
}

function isProtectedEvidenceKind(value: string): value is HarnessProtectedEvidenceKind {
  return (PROTECTED_EVIDENCE_KINDS as readonly string[]).includes(value)
}
