import type { PublicOfferingDto } from '@/modules/registry/public'

export type ProviderFact = Readonly<{
  term: string
  description: string | undefined
}>

export function offeringPathLabel(path: PublicOfferingDto['accessPaths'][number]): string {
  if (path.kind === 'external_operation') return path.name
  switch (path.channel) {
    case 'ae_inquiry':
      return 'AE inquiry'
    case 'phone':
      return 'Phone'
    case 'website':
      return 'Website'
    default: {
      const _exhaustive: never = path.channel
      return _exhaustive
    }
  }
}

export function ProviderFacts({ facts }: { facts: readonly ProviderFact[] }) {
  const present = facts.filter((fact) => fact.description !== undefined && fact.description.trim().length > 0)
  if (present.length === 0) {
    return null
  }

  return (
    <dl className="grid gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-2">
      {present.map((fact) => (
        <div key={fact.term}>
          <dt><span className="block text-sm text-muted-foreground">{fact.term}</span></dt>
          <dd className="mt-0.5"><span className="block text-sm font-medium text-foreground">{fact.description}</span></dd>
        </div>
      ))}
    </dl>
  )
}
