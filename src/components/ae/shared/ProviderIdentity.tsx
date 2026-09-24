import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ListingFact } from '@/modules/registry/public'

export type ProviderIdentityProps = Readonly<{
  name: ListingFact<string>
  summary?: ListingFact<string>
  href?: string
}>

export function ProviderIdentity({ name, summary, href }: ProviderIdentityProps) {
  if (name.kind !== 'present' || name.scope !== 'business') return null
  return (
    <Card role="region" aria-label="Verified Provider identity" className="min-w-0">
      <CardHeader><CardTitle><h1 className="break-words text-title-lg">{name.value}</h1></CardTitle></CardHeader>
      <CardContent className="grid gap-related">
        {summary?.kind === 'present' ? <p className="text-sm text-muted-foreground">{summary.value}</p> : null}
        <p className="text-xs text-muted-foreground">Business source: {name.provenance.replaceAll('_', ' ')}</p>
        <details className="text-xs text-muted-foreground"><summary className="min-h-touch cursor-pointer content-center">Technical source reference</summary><p className="break-all font-mono">{name.sourceRef}</p></details>
        {href === undefined ? null : <a className="min-h-touch w-fit content-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2" href={href}>Provider site</a>}
      </CardContent>
    </Card>
  )
}
