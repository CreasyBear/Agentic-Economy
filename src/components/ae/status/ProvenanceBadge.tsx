import { Badge } from '@/components/ui/badge'

export type ProvenanceBadgeProps = Readonly<{
  source?: string
}>

/** Source label only. It never asserts verification. */
export function ProvenanceBadge({ source }: ProvenanceBadgeProps) {
  if (source === undefined || source.trim().length === 0) return null
  return <Badge variant="outline">Source: {source}</Badge>
}
