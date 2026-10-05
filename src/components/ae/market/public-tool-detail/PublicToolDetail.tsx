import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { recordProductJourney } from '@/lib/observability/product-journey'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeToolInputDisclosure, AeToolTechnicalContract } from '@/components/ae/market/tool-detail/AeToolContractSections'
import { ToolFacts } from '@/components/ae/shared/ToolFacts'
import { alternativeToolSearchHref, projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import { ProductDetail, type DetailSlide } from '@/components/arc/market/ProductDetail'
import buttonStyles from '@/components/arc/button/button.module.css'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { projectAdmittedListing } from '@/modules/registry/public'
import type { PublicToolDetailProps, ToolUnavailablePresentation, ToolUnavailableProps } from './public-tool-detail.contracts'
import { TOOL_UNAVAILABLE_COPY } from './public-tool-detail.contracts'

export type { PublicToolDetailProps } from './public-tool-detail.contracts'

export function toolUnavailablePresentation(result: ToolUnavailableProps['result']): ToolUnavailablePresentation {
  if (result.kind === 'source_unavailable') {
    const copy = TOOL_UNAVAILABLE_COPY.source_unavailable
    return { tone: 'warning', title: copy.title, description: `${copy.cause} ${copy.nextStep}`, action: copy.action }
  }
  if (result.kind === 'invalid_ref') return { tone: 'neutral', title: 'This Tool reference is invalid', description: 'Browse the Market to find a current Tool.', action: { label: 'Browse Market', to: '/market' } }
  if (result.kind === 'not_found') return { tone: 'neutral', title: 'This exact Tool is unknown or no longer current', description: 'Browse the Market for current Tools.', action: { label: 'Browse Market', to: '/market' } }
  if (result.kind === 'unavailable') return { tone: 'warning', title: 'This Tool is not currently available', description: `${REASON_COPY[result.reason] ?? REASON_COPY_FALLBACK} No commercial facts or Call steps are shown.`, action: { label: 'Browse Market', to: '/market' } }
  return { tone: 'warning', title: 'Tool details are unavailable', description: 'Try again from the Market.', action: { label: 'Browse Market', to: '/market' } }
}

export function PublicToolDetail({ result }: PublicToolDetailProps) {
  const [readAt] = useState(() => Date.now())
  const observedToolRef = result.kind === 'found' ? result.tool.toolRef : undefined
  useEffect(() => {
    recordProductJourney({ action: 'tool_viewed', phase: result.kind === 'found' ? 'observed' : 'failed', surface: 'tool', listingKind: 'ae_callable' })
  }, [result.kind, observedToolRef])
  if (result.kind !== 'found') {
    const presentation = toolUnavailablePresentation(result)
    if (result.kind === 'source_unavailable') {
      return <AePageState tone={presentation.tone} title={presentation.title} description={presentation.description} action={<span className="flex flex-wrap gap-3"><Link to="/tools/$toolRef" params={{ toolRef: result.toolRef }} reloadDocument className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md} min-h-touch`}>Try again</Link><Link to="/market" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md} min-h-touch`}>Browse Market</Link></span>} />
    }
    return <AePageState tone={presentation.tone} title={presentation.title} description={presentation.description} action={<Link to={presentation.action.to} className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md} min-h-touch`}>{presentation.action.label}</Link>} />
  }
  const tool = result.tool
  const listing = projectAdmittedListing(tool, result.verifiedBusinessSlug)
  const view = projectToolObject(listing, `/tools/${encodeURIComponent(tool.toolRef)}`, readAt, result.referenceRate, tool.commercial.displayPrice)
  const readiness = listing.facts.readiness
  const recipientUnverified = tool.dataUse.some(effect => effect.recipient === 'named_recipient')
  const decisionView = recipientUnverified ? { ...view, readiness: { label: 'Input recipient not identified' } } : view
  const routeable = !recipientUnverified && readiness.kind === 'present' && readiness.value.posture === 'routeable' && tool.navigation.some(item => item.relation === 'call')
  const setupHref = `/agent-access?resumeTool=${encodeURIComponent(tool.toolRef)}`
  const alternativeHref = alternativeToolSearchHref(listing, `${tool.contract.capabilityId} ${tool.summary}`)
  const actionHref = !recipientUnverified && (routeable || tool.availability.posture === 'setup_required') ? setupHref : alternativeHref
  const slides: DetailSlide[] = (tool.contract.inputExamples ?? []).map((example, index) => ({
    id: `input-${index}-${example.label}`,
    label: example.label ?? `Input example ${index + 1}`,
    description: example.label === undefined ? 'Published input' : `Published input: ${example.label}`,
    content: <pre><code>{JSON.stringify(example.input, null, 2)}</code></pre>,
  }))
  if (slides.length === 0) slides.push({
    id: 'input-unpublished', label: 'Input example', description: 'No example input is published for this Tool.',
    content: <div className="arc-pdp-empty"><p>Inspect the exact input JSON Schema under Technical before requesting a Quote.</p></div>,
  })
  return <AePublicPage>
    <div className="arc-pdp-page">
      <ProductDetail
        id={tool.toolRef}
        title={decisionView.title}
        {...(decisionView.outcome === undefined ? {} : { summary: decisionView.outcome })}
        surfaceLabel="Admitted Tool"
        breadcrumb={<><Link to="/market">Market</Link><span aria-hidden="true"> / </span><span aria-current="page">Tool</span></>}
        {...(decisionView.price === undefined ? {} : { priceLabel: decisionView.price.label })}
        facts={<>
          <ToolFacts view={{ title: decisionView.title, listing, readiness: decisionView.readiness }} />
          {view.identity === undefined ? null : <p>{view.identity.kind === 'verified_provider' ? 'Provider' : view.identity.kind === 'publisher' ? 'Publisher' : 'Directory Host'}: {view.identity.kind === 'publisher' ? <span>{view.identity.name}</span> : <a href={view.identity.href}>{view.identity.name}</a>}</p>}
          {view.identity?.kind === 'publisher' && listing.identity.hostName.kind === 'present' && listing.hostPage.kind === 'present' ? <p>Directory Host: <a href={listing.hostPage.value}>{listing.identity.hostName.value}</a></p> : null}
          <p className="arc-pdp-provenance">Title source: {listing.identity.title.provenance.replaceAll('_', ' ')}</p>
          {view.price === undefined ? null : <p className="arc-pdp-provenance">Price source: {listing.facts.price.provenance.replaceAll('_', ' ')}</p>}
          {decisionView.readiness.source === undefined ? null : <p className="arc-pdp-provenance">Readiness source: {listing.facts.readiness.provenance.replaceAll('_', ' ')}</p>}
        </>}
        context={<>
          {listing.facts.price.kind === 'present' && listing.facts.price.value.kind !== 'quote_required' && listing.facts.price.value.currency === 'USDC' ? <p>Provider-listed source price: {listing.facts.price.value.kind === 'range' ? `${listing.facts.price.value.minimum}–${listing.facts.price.value.maximum}` : listing.facts.price.value.amount} USDC per Call. A fresh Quote confirms the buyer price.</p> : null}
          <p>No published output example. The output contract is under Technical.</p>
        </>}
        disclosure={<AeToolInputDisclosure tool={tool} />}
        primary={{ label: recipientUnverified ? 'Search callable alternatives' : routeable ? 'Set up to get a Quote' : tool.availability.posture === 'setup_required' ? 'Connect an Agent' : 'Search callable alternatives', onSelect: () => { window.location.assign(actionHref) } }}
        {...(recipientUnverified ? {} : { chatHref: `/t/new?q=${encodeURIComponent(`Find out how to use ${view.title} (${tool.toolRef}). Ask for required inputs and a fresh Quote before any Call.`)}` })}
        slides={slides}
        sections={[{ id: 'technical', title: 'Technical · operation IDs, schemas and terms', content: <AeToolTechnicalContract tool={tool} /> }]}
      />
    </div>
  </AePublicPage>
}
