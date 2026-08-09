import { ExternalLinkIcon } from 'lucide-react'

import { AeCopyPublicUrlButton } from '@/components/ae/forms/AeCopyPublicUrlButton'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'
import type { AdmissionBlocker } from '@/modules/inquiries/public'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  dispositionToAeStatus,
  offeringAccessToAeStatus,
  offeringSupportToAeStatus,
  trustTierToAeStatus,
} from '@/lib/ui/status-presentation'

type AeStatusCardProps = {
  readback: PublicOwnerStatusRouteReadback
}


/**
 * The blocker's own `ownerLabel` is the heading, so an action never repeats it —
 * and every action must land somewhere that can actually change the fact.
 * `not_published` fires for an unpublished page *or* an unpublished service, so
 * a claimed owner goes to Offerings; `/claim` would be a rejection funnel.
 */
type AdmissionOwnerAction =
  | Readonly<{ kind: 'link'; href: '/owner/offerings' | '/owner/settings'; label: string }>
  | Readonly<{ kind: 'instruction'; label: string }>

function ownerActionForAdmissionBlocker(blocker: AdmissionBlocker): AdmissionOwnerAction {
  switch (blocker.kind) {
    case 'not_published':
      return { kind: 'link', href: '/owner/offerings', label: 'Open Offerings' }
    case 'not_claimed':
      return { kind: 'instruction', label: 'Contact AE support to repair this business claim.' }
    case 'destination_unverified':
      return { kind: 'instruction', label: 'Contact AE support to record a destination check.' }
    case 'recipient_unresolvable':
      return { kind: 'instruction', label: 'Contact AE support to refresh the owner email proof.' }
    case 'suppressed':
      return { kind: 'instruction', label: 'Contact AE support to restore inquiry receiving.' }
    case 'not_ready':
      return { kind: 'instruction', label: 'AE must finish inquiry setup before requests can be received.' }
  }
}

export function AeStatusCard({ readback }: AeStatusCardProps) {
  const isPreview = readback.projectionMode === 'local_preview'
  const titleId = `ae-status-card-${readback.catalog.slug}`
  const hasUnavailableCapabilities = readback.unavailableCapabilities.length > 0
  const offeringStatuses = readback.catalog.offerings.map((offering) => ({
    support: offeringSupportToAeStatus(offering.support),
    access: offeringAccessToAeStatus(offering.accessPaths),
  }))
  const supportStatus = offeringStatuses.some(({ support }) => support === 'available')
    ? 'available'
    : offeringStatuses.some(({ support }) => support === 'guarded')
      ? 'guarded'
      : 'not_live'
  const accessStatus = offeringStatuses.some(({ access }) => access === 'listed') ? 'listed' : 'not_queued'

  return (
    <Card className="p-6" aria-labelledby={titleId}>
      <div className="grid gap-6">
        <div className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="block text-lg font-semibold text-foreground" id={titleId}>{readback.catalog.name}</h2>
            <p className="block text-sm text-muted-foreground">
              {readback.catalog.category} in {readback.catalog.suburb}, {readback.catalog.stateTerritory}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isPreview ? <Badge variant="outline">Preview</Badge> : (
              <AeCopyPublicUrlButton
                slug={readback.catalog.slug}
                businessId={readPublicCatalogActivationRef(readback.catalog)}
                size="sm"
              />
            )}
            <Button asChild variant="secondary" size="sm">
              <a href={readback.publicUrl}><ExternalLinkIcon aria-hidden="true" />{isPreview ? 'Open preview' : 'Open page'}</a>
            </Button>
          </div>
        </div>
        <Separator />
        <div className="grid gap-4">
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
            <li><AeStatusBadge status={dispositionToAeStatus(readback.catalog.disposition)} /></li>
            <li><AeStatusBadge status={trustTierToAeStatus(readback.catalog.trustTier)} /></li>
            <li><AeStatusBadge status={supportStatus} /></li>
            <li><AeStatusBadge status={accessStatus} /></li>
          </ul>
          {hasUnavailableCapabilities ? (
            <ul className="m-0 grid list-none gap-3 p-0">
              {readback.unavailableCapabilities.map((capability) => (
                <li key={capability.label} className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="block font-medium text-foreground">{capability.label}</p>
                  <p className="block text-sm text-muted-foreground">{capability.explanation}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Separator />
        <div className="grid gap-3">
          <h3 className="block text-lg font-semibold text-foreground">Request admission</h3>
          {readback.admission.admitted ? (
            <p className="block text-foreground">{isPreview ? 'Preview can receive requests in local testing only.' : 'Your business page can receive requests.'}</p>
          ) : (
            <div className="grid gap-2">
              <p className="block text-sm text-muted-foreground">
                {isPreview ? 'Preview only. Connect the public source before sharing this page.' : 'Complete these checks to start receiving requests from this page.'}
              </p>
              <ul className="m-0 grid list-none gap-3 p-0">
                {readback.admission.blockers.map((blocker) => {
                  const action = ownerActionForAdmissionBlocker(blocker)
                  return (
                    <li key={blocker.kind} className="rounded-lg border border-border p-3">
                      <p className="block font-medium text-foreground">{blocker.ownerLabel}</p>
                      {action.kind === 'link' ? (
                        <Button asChild variant="secondary" size="sm">
                          <a href={action.href}>{action.label}</a>
                        </Button>
                      ) : (
                        <p className="block text-sm text-muted-foreground">{action.label}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
        <p className="block text-sm text-muted-foreground">{readback.nextAction}</p>
      </div>
    </Card>
  )
}
