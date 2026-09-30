import { isPublicToolRef } from '@/modules/capability-supply/public'
import { isRecord } from '@/modules/common/is-record'
import type { ToolCardProjection } from './tool-card'

export function addRef(refs: string[], value: unknown): void {
  if (refs.length >= 4 || !isPublicToolRef(value) || refs.includes(value)) return
  refs.push(value)
}

export function collectToolRefs(output: Record<string, unknown>, choices: readonly { toolRef: string }[]): string[] {
  const toolRefs: string[] = []
  addRef(toolRefs, output.toolRef)
  if (isRecord(output.tool)) addRef(toolRefs, output.tool.toolRef)
  for (const field of ['toolRefs', 'items', 'results', 'tools'] as const) {
    const values = output[field]
    if (!Array.isArray(values)) continue
    for (const value of values) addRef(toolRefs, isRecord(value) ? value.toolRef : value)
  }
  for (const choice of choices) addRef(toolRefs, choice.toolRef)
  return toolRefs
}

export function matchedCount(output: Record<string, unknown>): number | undefined {
  if (typeof output.count === 'number' && Number.isSafeInteger(output.count)) return Math.max(0, output.count)
  if (typeof output.matchedCount === 'number' && Number.isSafeInteger(output.matchedCount)) return Math.max(0, output.matchedCount)
  if (Array.isArray(output.results)) return output.results.length
  if (Array.isArray(output.items)) return output.items.length
  if (Array.isArray(output.tools)) return output.tools.length
  return undefined
}
export function serializeChoicesCard(
  card: Extract<ToolCardProjection, { kind: 'choices' }>,
): Record<string, unknown> {
  return {
    type: 'tool-card',
    kind: 'choices',
    toolId: card.toolId,
    title: card.title,
    state: 'complete',
    toolRefs: [...card.toolRefs],
    choices: card.choices.map((choice) => ({ ...choice })),
    ...(card.count === undefined ? {} : { count: card.count }),
    ...(card.surface === undefined ? {} : { surface: card.surface }),
    ...(card.verdict === undefined ? {} : { verdict: card.verdict }),
    ...(card.coverage === undefined ? {} : { coverage: card.coverage }),
    ...(card.next === undefined ? {} : { next: card.next }),
    ...(card.recommendation === undefined ? {} : { recommendation: { ...card.recommendation } }),
    ...(card.contrasts === undefined || card.contrasts.length === 0
      ? {}
      : { contrasts: card.contrasts.map((fact) => ({ ...fact })) }),
  }
}
