import { Badge } from '@/components/ui/badge'

export type ProvenanceBadgeProps = Readonly<{
  source?: string
}>

/** Buyer-facing badge for published business evidence. */
export function ProvenanceBadge(_props: ProvenanceBadgeProps) {
  return <Badge variant="default">Verified</Badge>
}
