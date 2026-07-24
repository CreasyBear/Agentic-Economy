import { ExternalLinkIcon } from 'lucide-react'

import { AeCopyPublicUrlButton } from '@/components/ae/forms/AeCopyPublicUrlButton'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'
import type { AdmissionBlocker } from '@/modules/inquiries/public'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import {
  discoveryStatusToAeStatus,
  indexStatusToAeStatus,
  publicStatusToAeStatus,
  trustTierToAeStatus,
} from '@/lib/ui/status-presentation'

type AeStatusCardProps = {
  readback: PublicOwnerStatusRouteReadback
}


type AdmissionOwnerAction =
  | Readonly<{ kind: 'link'; href: '/claim' | '/owner/settings'; label: string }>
  | Readonly<{ kind: 'instruction'; label: string }>

function ownerActionForAdmissionBlocker(blocker: AdmissionBlocker): AdmissionOwnerAction {
  switch (blocker.kind) {
    case 'not_published':
      return { kind: 'link', href: '/claim', label: 'Publish this business page' }
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
  const titleId = `ae-status-card-${readback.catalog.slug}`
  const hasUnavailableCapabilities = readback.unavailableCapabilities.length > 0

  return (
    <Card padding={6} aria-labelledby={titleId}>
      <VStack gap={6}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Text as="div" type="large" weight="semibold" color="primary" display="block" id={titleId}>{readback.catalog.name}</Text>
            <Text as="div" type="supporting" color="secondary" display="block">
              {readback.catalog.category} in {readback.catalog.suburb}, {readback.catalog.stateTerritory}
            </Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            <AeCopyPublicUrlButton
              slug={readback.catalog.slug}
              businessId={readPublicCatalogActivationRef(readback.catalog)}
              size="sm"
            />
            <Button
              href={readback.publicUrl}
              variant="secondary"
              size="sm"
              label="Open page"
              icon={<ExternalLinkIcon aria-hidden="true" />}
            />
          </HStack>
        </VStack>
        <Divider />
        <VStack gap={4}>
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
            <li><AeStatusBadge status={publicStatusToAeStatus(readback.catalog.publicStatus)} /></li>
            <li><AeStatusBadge status={trustTierToAeStatus(readback.catalog.trustTier)} /></li>
            <li><AeStatusBadge status={indexStatusToAeStatus(readback.catalog.indexStatus)} /></li>
            <li><AeStatusBadge status={discoveryStatusToAeStatus(readback.catalog.discoveryStatus)} /></li>
          </ul>
          {hasUnavailableCapabilities ? (
            <ul className="m-0 grid list-none gap-3 p-0">
              {readback.unavailableCapabilities.map((capability) => (
                <li key={capability.label} className="rounded-lg border border-border bg-muted/40 p-3">
                  <Text weight="medium" color="primary" display="block">{capability.label}</Text>
                  <Text type="supporting" color="secondary" display="block">{capability.explanation}</Text>
                </li>
              ))}
            </ul>
          ) : null}
        </VStack>
        <Divider />
        <VStack gap={3}>
          <Text as="h2" type="large" weight="semibold" color="primary" display="block">Request admission</Text>
          {readback.admission.admitted ? (
            <Text color="primary" display="block">Your business page can receive requests.</Text>
          ) : (
            <VStack gap={2}>
              <Text type="supporting" color="secondary" display="block">
                Complete these checks to start receiving requests from this page.
              </Text>
              <ul className="m-0 grid list-none gap-3 p-0">
                {readback.admission.blockers.map((blocker) => {
                  const action = ownerActionForAdmissionBlocker(blocker)
                  return (
                    <li key={blocker.kind} className="rounded-lg border border-border p-3">
                      <Text weight="medium" color="primary" display="block">{blocker.ownerLabel}</Text>
                      {action.kind === 'link' ? (
                        <Button href={action.href} variant="secondary" size="sm" label={action.label} />
                      ) : (
                        <Text type="supporting" color="secondary" display="block">{action.label}</Text>
                      )}
                    </li>
                  )
                })}
              </ul>
            </VStack>
          )}
        </VStack>
        <Text type="supporting" color="secondary" display="block">{readback.nextAction}</Text>
      </VStack>
    </Card>
  )
}
