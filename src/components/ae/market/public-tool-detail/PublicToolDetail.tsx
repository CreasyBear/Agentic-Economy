import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { recordProductJourney } from '@/lib/observability/product-journey'

import { AeToolLatencyChart } from '@/components/ae/market/tool-detail/AeToolLatencyChart'
import { alternativeToolSearchHref, projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import { Alert } from '@/components/arc/alert/alert'
import { Button } from '@/components/arc/button/button'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import type { AeStatus } from '@/lib/ui/status-presentation'
import { BRAND_NAME } from '@/content/brand-copy'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { projectAdmittedListing } from '@/modules/registry/public'
import { formatToolDuration } from '@/modules/registry/tool-latency'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'

import type { ToolRun } from '../DirectoryToolPlayground'
import type { PublicToolDetailProps, ToolUnavailablePresentation, ToolUnavailableProps } from './public-tool-detail.contracts'
import { TOOL_UNAVAILABLE_COPY, priceWithoutUnit, sourcePriceNote, unavailableDescription } from './public-tool-detail.contracts'
import { ToolPage } from './ToolPage'
import { ToolPageState } from './ToolPageState'
import styles from './ToolPage.module.css'

export type { PublicToolDetailProps } from './public-tool-detail.contracts'

export function toolUnavailablePresentation(result: ToolUnavailableProps['result']): ToolUnavailablePresentation {
  if (result.kind === 'source_unavailable') {
    const copy = TOOL_UNAVAILABLE_COPY.source_unavailable
    return { tone: 'warning', title: copy.title, description: unavailableDescription(copy), action: copy.action }
  }
  if (result.kind === 'invalid_ref') return { tone: 'neutral', title: 'This tool link is not valid', description: 'The address may be cut short or out of date.', action: { label: 'Browse tools', to: '/market' } }
  if (result.kind === 'not_found') return { tone: 'neutral', title: 'This tool is unknown or no longer current', description: 'It may have been renamed or removed by its provider.', action: { label: 'Browse tools', to: '/market' } }
  if (result.kind === 'unavailable') return { tone: 'warning', title: 'This tool is not available right now', description: `${REASON_COPY[result.reason] ?? REASON_COPY_FALLBACK} No price or call steps are shown.`, action: { label: 'Browse tools', to: '/market' } }
  return { tone: 'warning', title: 'Tool details are unavailable', description: 'Try again from the tools list.', action: { label: 'Browse tools', to: '/market' } }
}

export function PublicToolDetail({ result, baseUrl, search, onSearchChange }: PublicToolDetailProps) {
  const router = useRouter()
  const retry = () => { void router.invalidate() }
  const [readAt] = useState(() => Date.now())
  const observedToolRef = result.kind === 'found' ? result.tool.toolRef : undefined
  useEffect(() => {
    recordProductJourney({ action: 'tool_viewed', phase: result.kind === 'found' ? 'observed' : 'failed', surface: 'tool', listingKind: 'ae_callable' })
  }, [result.kind, observedToolRef])
  if (result.kind !== 'found') {
    const presentation = toolUnavailablePresentation(result)
    if (result.kind === 'source_unavailable') {
      return <ToolPageState title={presentation.title} description={presentation.description} action={<><Button type="button" variant="primary" className="min-h-touch" onClick={retry}>Try again</Button><Link to="/market" className={`${actionLinkClassName('secondary', 'md')} min-h-touch`}>Browse tools</Link></>} />
    }
    return <ToolPageState title={presentation.title} description={presentation.description} action={<Link to={presentation.action.to} className={`${actionLinkClassName('primary', 'md')} min-h-touch`}>{presentation.action.label}</Link>} />
  }
  const tool = result.tool
  const latency = result.evidence?.toolRef === tool.toolRef ? result.evidence.latency : undefined
  const listing = projectAdmittedListing(tool, result.verifiedBusinessSlug)
  const view = projectToolObject(listing, `/tools/${encodeURIComponent(tool.toolRef)}`, readAt, result.referenceRate, tool.commercial.displayPrice)
  const readiness = listing.facts.readiness
  const recipientUnverified = tool.dataUse.some(effect => effect.recipient === 'named_recipient')
  const fresh = view.readiness.label !== 'Readiness stale'
  const posture = readiness.kind === 'present' && fresh ? readiness.value.posture : undefined
  const routeable = !recipientUnverified && posture === 'routeable' && tool.navigation.some(item => item.relation === 'call')
  const alternativeHref = alternativeToolSearchHref(listing, `${tool.contract.capabilityId} ${tool.summary}`)
  const run: ToolRun = routeable ? { kind: 'callable', toolRef: tool.toolRef }
    : !recipientUnverified && tool.availability.posture === 'setup_required'
      ? { kind: 'elsewhere', label: 'Connect an agent', href: `/agent-access?resumeTool=${encodeURIComponent(tool.toolRef)}`, reason: 'This tool runs once an agent is connected to your account.' }
      : { kind: 'elsewhere', label: 'See similar tools', href: alternativeHref, reason: recipientUnverified ? `The provider hasn’t said who receives your input, so ${BRAND_NAME} won’t run it.` : posture === undefined ? 'We couldn’t confirm whether this tool can run right now.' : 'This tool can’t run right now.' }
  const price = priceWithoutUnit(view.price?.label)
  const priceNote = sourcePriceNote(listing, price)
  const example = tool.contract.inputExamples?.[0]
  return <ToolPage {...(search === undefined ? {} : { search })} {...(onSearchChange === undefined ? {} : { onSearchChange })} model={{
    title: view.title,
    ...(view.outcome === undefined ? {} : { summary: view.outcome }),
    ...(view.identity === undefined ? {} : { provider: { name: view.identity.name, ...('href' in view.identity ? { href: view.identity.href } : {}) } }),
    ...(price === undefined ? {} : { price }),
    ...(priceNote === undefined ? {} : { priceNote }),
    readiness: READINESS_BADGE[readinessBadge(recipientUnverified, posture)],
    ...(latency === undefined || latency.sampleSize <= 0 ? {} : { activity: latency.kind === 'measured' ? `${latency.sampleSize} completed calls in 30 days` : `${latency.sampleSize} completed ${latency.sampleSize === 1 ? 'call' : 'calls'} so far` }),
    ...(run.kind === 'callable' ? { reference: { label: 'Tool ID', value: tool.toolRef } } : {}),
    run,
    baseUrl,
    inputSchemaJson: JSON.stringify(tool.contract.inputJsonSchema),
    outputSchemaJson: JSON.stringify(tool.contract.outputJsonSchema),
    ...(example === undefined ? {} : { sampleInputJson: JSON.stringify(example.input) }),
    inputNotice: <InputRecipient tool={tool} />,
    trackRecord: latency === undefined
      ? <EmptyState title="Timing history is unavailable" description="The call history for this tool can't be read right now." titleAs="p" action={<Button type="button" variant="secondary" size="sm" onClick={retry}>Try again</Button>} />
      : <>
        <AeToolLatencyChart latency={latency} />
        <p className={styles.muted}>{latency.kind === 'measured' ? `Median ${latency.display}, p95 ${formatToolDuration(latency.p95Ms)} across ${latency.sampleSize} completed calls in the last 30 days.` : `${latency.sampleSize} completed ${latency.sampleSize === 1 ? 'call' : 'calls'} so far. Median and p95 appear after ${latency.minimumSampleSize}.`}</p>
        <p className={styles.muted}>{latency.definition}</p>
      </>,
  }} />
}

type ReadinessStatus = 'ready_now' | 'setup_required' | 'input_recipient_not_named' | 'readiness_unknown' | 'not_available_right_now'

const READINESS_BADGE: Readonly<Record<ReadinessStatus, AeStatus>> = {
  ready_now: 'ready_now',
  setup_required: 'setup_required',
  input_recipient_not_named: 'needs_attention',
  readiness_unknown: 'unavailable',
  not_available_right_now: 'not_live',
}

function readinessBadge(recipientUnverified: boolean, posture: string | undefined): ReadinessStatus {
  if (recipientUnverified) return 'input_recipient_not_named'
  if (posture === 'routeable') return 'ready_now'
  if (posture === 'setup_required') return 'setup_required'
  if (posture === undefined) return 'readiness_unknown'
  return 'not_available_right_now'
}

function InputRecipient({ tool }: Readonly<{ tool: PublicToolDescriptor }>) {
  const fields = [...new Set(tool.dataUse.map(effect => effect.inputPointer))]
  if (fields.length === 0) return <Alert tone="info" title={`${tool.business.name} hasn’t declared which input fields it receives`}>Check the input schema before you run it. Nothing runs until you approve the price.</Alert>
  return <Alert tone="info" title={`Your input goes to ${tool.business.name}`}>
    Fields sent: {fields.map((field, index) => <span key={field}>{index === 0 ? '' : ', '}<code>{field}</code></span>)}. Nothing runs until you approve the price.
  </Alert>
}
