import './ProviderCatalogueComposition.css'
import type { ListingFact } from '@/modules/registry/public'

export type ProviderIdentityProps = Readonly<{
  name: ListingFact<string>
  summary?: ListingFact<string>
  href?: string
}>

export function ProviderIdentity({ name, summary, href }: ProviderIdentityProps) {
  if (name.kind !== 'present' || name.scope !== 'business') return null
  return (
    <section role="region" aria-label="Verified Provider identity" className="arc-provider-identity">
      <div className="arc-provider-title">
        <h1>{name.value}</h1>
        {summary?.kind === 'present' ? <p>{summary.value}</p> : null}
      </div>
      <div className="arc-provider-source">
        <p>Business source: {name.provenance.replaceAll('_', ' ')}</p>
        <details><summary>Technical source reference</summary><p>{name.sourceRef}</p></details>
        {href === undefined ? null : <a href={href}>Provider site</a>}
      </div>
    </section>
  )
}
