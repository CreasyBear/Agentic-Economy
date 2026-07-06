import { ExternalLinkIcon } from 'lucide-react'

import { AeCopyPublicUrlButton } from '@/components/ae/forms/AeCopyPublicUrlButton'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'
import type { TrustTier } from '@/modules/business/public'
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

export type OwnerTrustTierProgressStep = {
  tier: TrustTier
  label: string
  state: 'reached' | 'current' | 'next'
  action: string
}

const ownerTrustTierOrder: readonly TrustTier[] = ['claimed', 'contact_confirmed', 'listed', 'registry_verified']

const ownerTrustTierCopy = {
  claimed: {
    label: 'Claimed',
    reached: 'Owner claim recorded.',
    action: 'Submit a signed-in claim with business name, category, suburb, state, slug, and at least one fact note.',
  },
  contact_confirmed: {
    label: 'Contact confirmed',
    reached: 'Contact evidence recorded.',
    action: 'Send AE the public contact evidence you want recorded for this page.',
  },
  listed: {
    label: 'Listed',
    reached: 'Published service page is live.',
    action: 'Publish at least one service with service area, hours, and first-request instructions.',
  },
  registry_verified: {
    label: 'Registry checked',
    reached: 'Registry check recorded.',
    action: 'Ask AE to run and record the registry check for this page.',
  },
} satisfies Record<TrustTier, { label: string; reached: string; action: string }>

export function buildOwnerTrustTierProgress(currentTier: TrustTier): readonly OwnerTrustTierProgressStep[] {
  const currentIndex = ownerTrustTierOrder.indexOf(currentTier)
  return ownerTrustTierOrder.map((tier, index) => {
    const copy = ownerTrustTierCopy[tier]
    const isReached = index < currentIndex
    const isCurrent = index === currentIndex
    return {
      tier,
      label: copy.label,
      state: isCurrent ? 'current' : isReached ? 'reached' : 'next',
      action: isReached || isCurrent ? copy.reached : copy.action,
    }
  })
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
            <li>
              <AeStatusBadge status={publicStatusToAeStatus(readback.catalog.publicStatus)} />
            </li>
            <li>
              <AeStatusBadge status={trustTierToAeStatus(readback.catalog.trustTier)} />
            </li>
            <li>
              <AeStatusBadge status={indexStatusToAeStatus(readback.catalog.indexStatus)} />
            </li>
            <li>
              <AeStatusBadge status={discoveryStatusToAeStatus(readback.catalog.discoveryStatus)} />
            </li>
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
          <VStack gap={1}>
            <Text as="h2" type="large" weight="semibold" color="primary" display="block">Page progress</Text>
            <Text type="supporting" color="secondary" display="block">
              Each step shows what AE has recorded for this business page and the next concrete owner action.
            </Text>
          </VStack>
          <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-4" aria-label="Business page progress">
            {buildOwnerTrustTierProgress(readback.catalog.trustTier).map((step, index) => (
              <li
                key={step.tier}
                className="rounded-lg border border-border bg-card p-3"
                data-tier={step.tier}
                data-state={step.state}
                aria-current={step.state === 'current' ? 'step' : undefined}
              >
                <Text type="supporting" color="secondary" display="block">Step {index + 1}</Text>
                <Text weight="medium" color="primary" display="block">{step.label}</Text>
                <Text type="supporting" color="secondary" display="block">{step.action}</Text>
              </li>
            ))}
          </ol>
        </VStack>
        <Text type="supporting" color="secondary" display="block">{readback.nextAction}</Text>
      </VStack>
    </Card>
  )
}
