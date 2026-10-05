import { isPublicToolRef } from '@/modules/capability-supply/public'
import { isRecord } from '@/modules/common/is-record'

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

export function boundedString(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  return Array.from(value.trim()).slice(0, maximum).join('')
}
export function directoryChoiceFields(value: Record<string, unknown>) {
  const summary = boundedString(value.summary ?? value.description, 400)
  const sourcePrice = boundedString(value.sourcePrice, 80)
  const host = boundedString(value.host, 300)
  const resourcePath = boundedString(value.resourcePath, 512)
  const networkLabel = boundedString(value.networkLabel, 128)
  return {
    ...(summary === undefined ? {} : { summary }),
    ...(sourcePrice === undefined ? {} : { sourcePrice }),
    ...(host === undefined ? {} : { host }),
    ...(resourcePath === undefined ? {} : { resourcePath }),
    ...(networkLabel === undefined ? {} : { networkLabel }),
  }
}
