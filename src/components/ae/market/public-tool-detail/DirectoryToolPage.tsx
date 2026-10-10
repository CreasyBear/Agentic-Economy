import { formatCount } from '@/lib/ui/format-time'
import { Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIcon } from 'lucide-react'
import { recordProductJourney } from '@/lib/observability/product-journey'

import { alternativeToolSearchHref, projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import { RelativeTime } from '@/components/ae/shared/RelativeTime'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { BRAND_NAME } from '@/content/brand-copy'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { DIRECTORY_READINESS, directoryActivityLabel, directoryLede, toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { X402DirectoryCatalogueResource } from '@/modules/market/x402-directory-catalogue'
import { projectDirectoryListing } from '@/modules/registry/public'
import type { ReferenceRate } from '@/modules/money/public'

import { TOOL_UNAVAILABLE_COPY, priceWithoutUnit, sourcePriceNote, unavailableDescription } from './public-tool-detail.contracts'
import { ToolPage } from './ToolPage'
import { ToolPageState } from './ToolPageState'
import type { ToolPageSearch, ToolPageSearchChange } from './tool-page-search'
import styles from './ToolPage.module.css'

export type DirectoryToolPageProps = Readonly<{ metadata: X402DirectoryCatalogueResource; providerHost: string; slug: string; baseUrl: string | undefined; referenceRate?: ReferenceRate; search?: ToolPageSearch; onSearchChange?: ToolPageSearchChange }>

export function DirectoryToolPage({ metadata, providerHost, slug, baseUrl, referenceRate, search, onSearchChange }: DirectoryToolPageProps) {
  const [readAt] = useState(() => Date.now())
  useEffect(() => {
    recordProductJourney({ action: 'tool_viewed', phase: metadata.kind === 'found' || metadata.kind === 'found_upstream' ? 'observed' : 'failed', surface: 'tool', listingKind: 'external_listing' })
  }, [providerHost, slug, metadata.kind])
  if (metadata.kind !== 'found' && metadata.kind !== 'found_upstream') {
    const reason = metadata.kind === 'not_found' ? 'resource_not_found' : metadata.reason === 'query_invalid' ? 'query_invalid' : 'source_unavailable'
    const copy = TOOL_UNAVAILABLE_COPY[reason]
    return <ToolPageState title={copy.title} description={unavailableDescription(copy)} action={<Link to={copy.action.to} className={`${actionLinkClassName('primary', 'md')} min-h-touch`}>{copy.action.label}</Link>} />
  }
  const entry = metadata.item.entry
  const card = toDirectoryToolCardModel(entry)
  const listing = projectDirectoryListing({ ...entry, title: card.title })
  const view = projectToolObject(listing, `/tools/${encodeURIComponent(providerHost)}/${encodeURIComponent(slug)}`, readAt, referenceRate)
  const choice = metadata.kind === 'found' ? metadata.item.choice : undefined
  const callableRef = choice?.access === 'ae_callable' ? choice.toolRef : undefined
  const indexedSourceRouteRef = metadata.kind === 'found' ? choice?.sourceRouteRef ?? metadata.item.sourceRouteRef : undefined
  const capability = entry.description || entry.category || entry.tags?.join(' ') || ''
  const alternativeHref = capability.trim().length === 0 ? '/market' : alternativeToolSearchHref(listing, capability, indexedSourceRouteRef)
  const price = priceWithoutUnit(view.price?.label)
  const priceNote = sourcePriceNote(listing, price)
  const providerHref = view.identity !== undefined && 'href' in view.identity ? view.identity.href : undefined
  const providerName = entry.serviceName?.trim() || view.identity?.name || providerHost
  const summary = directoryLede(entry, card.title)
  const activity = directoryActivityLabel(entry.activity)
  return <ToolPage {...(search === undefined ? {} : { search })} {...(onSearchChange === undefined ? {} : { onSearchChange })} model={{
    title: card.title,
    ...(summary === undefined ? {} : { summary }),
    provider: { name: providerName, ...(providerName === providerHost ? {} : { host: providerHost }), ...(providerHref === undefined ? {} : { href: providerHref }), ...(entry.iconUrl === undefined ? {} : { iconUrl: entry.iconUrl }) },
    ...(price === undefined ? {} : { price }),
    ...(priceNote === undefined ? {} : { priceNote }),
    readiness: DIRECTORY_READINESS[callableRef === undefined ? 'unavailable' : 'ae_callable'],
    ...(activity === undefined ? {} : { activity }),
    endpoint: entry.resource,
    ...(entry.method === undefined ? {} : { method: entry.method.toUpperCase() }),
    run: callableRef !== undefined ? { kind: 'callable', toolRef: callableRef } : {
      kind: 'elsewhere',
      label: capability.trim().length === 0 ? 'Browse tools' : 'See similar tools',
      href: alternativeHref,
      reason: `${BRAND_NAME} can’t run this listing. ${REASON_COPY[choice?.reason ?? 'fallback'] ?? REASON_COPY_FALLBACK}`,
    },
    baseUrl,
    ...(entry.input?.schemaJson === undefined ? {} : { inputSchemaJson: entry.input.schemaJson }),
    ...(entry.output?.schemaJson === undefined ? {} : { outputSchemaJson: entry.output.schemaJson }),
    ...(entry.input?.exampleJson === undefined ? {} : { sampleInputJson: entry.input.exampleJson }),
    ...(entry.output?.exampleJson === undefined ? {} : { sampleOutputJson: entry.output.exampleJson }),
    trackRecord: <DirectoryActivity activity={entry.activity} />,
  }} />
}

function DirectoryActivity({ activity }: Readonly<{ activity: X402DirectoryEntry['activity'] }>) {
  const lastCalled = activity?.lastCalledAt === undefined ? undefined : new Date(activity.lastCalledAt)
  const facts: ([string, ReactNode] | undefined)[] = [
    activity?.calls30d === undefined ? undefined : ['Paid calls, last 30 days', formatCount(activity.calls30d)],
    activity?.payers30d === undefined ? undefined : ['Buyers, last 30 days', formatCount(activity.payers30d)],
    lastCalled === undefined || Number.isNaN(lastCalled.getTime()) ? undefined : ['Last paid call', <RelativeTime key="last-called" value={lastCalled} />],
  ]
  const rows = facts.filter((row): row is [string, ReactNode] => row !== undefined)
  if (rows.length === 0) return <EmptyState icon={<ActivityIcon aria-hidden="true" />} title="No track record yet" description="The x402 directory hasn't recorded paid calls for this listing." titleAs="p" />
  return <>
    <dl className={styles.facts}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className={styles.muted}>Reported by the x402 directory.</p>
  </>
}
