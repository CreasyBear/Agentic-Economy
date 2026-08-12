import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import type { WebDiscoveryClaim } from '@/modules/storefront/public'

type AeImportedClaimsProps = Readonly<{
  claims: readonly WebDiscoveryClaim[]
  query?: string
}>

export function AeImportedClaims({ claims, query }: AeImportedClaimsProps) {
  if (claims.length === 0) return null

  return (
    <section aria-label="Imported claims" className="grid gap-4">
      <header className="grid gap-1 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Imported Claims</Badge>
          <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">From the web</span>
        </div>
        <p className="font-heading text-xl text-foreground">Bring a business into the network</p>
        <p className="block max-w-3xl text-muted-foreground">
          These are web-sourced claims, not AE-listed options. Review the source before contacting a business; AE has not verified the claim or its availability.
        </p>
      </header>
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
        {claims.map((claim) => (
          <li key={`${claim.businessName}-${claim.suburb}`}>
            <Card className="grid h-full gap-3 border border-border bg-card p-4">
              <div className="grid gap-1">
                <p className="font-heading text-lg leading-snug text-foreground">{claim.businessName}</p>
                <p className="text-sm text-muted-foreground">{claim.suburb}</p>
              </div>
              {claim.serviceSummary === undefined ? null : <p className="text-sm leading-relaxed text-foreground">{claim.serviceSummary}</p>}
              <dl className="grid gap-1 text-sm text-muted-foreground">
                {claim.phone === undefined ? null : (
                  <div className="flex gap-2"><dt className="font-medium text-foreground">Phone</dt><dd><a className="underline-offset-4 hover:underline" href={`tel:${claim.phone}`}>{claim.phone}</a></dd></div>
                )}
                {claim.websiteUrl === undefined ? null : (
                  <div className="flex gap-2"><dt className="font-medium text-foreground">Website</dt><dd><a className="underline-offset-4 hover:underline" href={claim.websiteUrl} target="_blank" rel="noreferrer">Open website</a></dd></div>
                )}
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <Button asChild variant="default" size="sm">
                  <Link
                    to="/claim"
                    search={{
                      businessName: claim.businessName,
                      businessContext: {
                        kind: 'local_human',
                        suburb: claim.suburb,
                        stateTerritory: '',
                      },
                      ...(query === undefined ? {} : { category: query.slice(0, 120) }),
                    }}
                  >
                    Invite this business to list on AE
                  </Link>
                </Button>
                {claim.sourceUrl === undefined ? null : <a className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={claim.sourceUrl} target="_blank" rel="noreferrer">Web source</a>}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
