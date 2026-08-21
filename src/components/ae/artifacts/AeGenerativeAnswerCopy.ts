import { neutralizeBidiFormattingControls } from '@/modules/answer/public'

export const OPERATION_JSON_MAX_BYTES = 256 * 1024

// Calm fade-only reveal. Slide-from-bottom on every streamed part stacks into
// jitter when several artifacts arrive in quick succession, so parts just fade.
export const REVEAL_ENTER =
  'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-base motion-safe:ease-standard'

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
