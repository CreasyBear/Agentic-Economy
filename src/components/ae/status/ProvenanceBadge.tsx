import { Badge } from '@/components/ui/badge'

export type ProvenanceBadgeProps = Readonly<{
  source: string
}>

/**
 * Buyer-facing provenance trust badge. Honest two-state: sandbox/demo supply
 * shows "Preview"; published/real supply shows "Verified". No other states.
 * Driven by the same `evidence.source`-style field the catalog exposes.
 */
export function ProvenanceBadge({ source }: ProvenanceBadgeProps) {
  return source === 'ae_sandbox' ? (
    <Badge variant="outline">Preview</Badge>
  ) : (
    <Badge variant="default">Verified</Badge>
  )
}
