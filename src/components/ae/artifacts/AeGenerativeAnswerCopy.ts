import { neutralizeBidiFormattingControls } from '@/modules/answer/public'

export const OPERATION_JSON_MAX_BYTES = 256 * 1024

// Streaming content appears in document order. Avoid decorative entrance motion
// so newly available evidence stays easy to scan and reduced-motion is inherent.
export const REVEAL_ENTER = ''

export function formatMachineLabel(value: string): string {
  const label = neutralizeBidiFormattingControls(value)
    .replaceAll('_', ' ')
    .replace(/\b(?:ae|http|mcp)\b/giu, (part) => part.toUpperCase())
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function listingCountLabel(count: number): string {
  if (count === 1) {
    return '1 match'
  }
  if (count <= 0) {
    return 'matches'
  }
  return `${count} matches`
}
