import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeToolInputDisclosure, AeToolTechnicalContract } from '@/components/ae/market/tool-detail/AeToolContractSections'
import { ToolDetailFacts } from '@/components/ae/shared/ToolDetailFacts'
import { alternativeToolSearchHref, projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import { buttonVariants } from '@/components/ui/button-variants'
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
  if (result.kind !== 'found') {
    const presentation = toolUnavailablePresentation(result)
    return <AePageState tone={presentation.tone} title={presentation.title} description={presentation.description} action={<Link to={presentation.action.to} className={buttonVariants({ className: 'min-h-touch' })}>{presentation.action.label}</Link>} />
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
  const example = tool.contract.inputExamples?.[0]
  return <AePublicPage>
    <article className="ae-rail grid min-w-0 gap-section pb-page pt-section">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link to="/market" className="min-h-touch content-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Market</Link><span aria-hidden="true"> / </span>Tool</nav>
      <AeToolInputDisclosure tool={tool} />
      <ToolDetailFacts view={decisionView} hideTechnicalRefs primary={{ label: recipientUnverified ? 'Search callable alternatives' : routeable ? 'Set up to get a Quote' : tool.availability.posture === 'setup_required' ? 'Connect an Agent' : 'Search callable alternatives', onSelect: () => { window.location.assign(actionHref) } }} {...(recipientUnverified ? {} : { chatHref: `/t/new?q=${encodeURIComponent(`Find out how to use ${view.title} (${tool.toolRef}). Ask for required inputs and a fresh Quote before any Call.`)}` })} />
      {listing.facts.price.kind === 'present' && listing.facts.price.value.kind !== 'quote_required' && listing.facts.price.value.currency === 'USDC' ? <p className="text-sm text-muted-foreground">Provider-listed source price: {listing.facts.price.value.kind === 'range' ? `${listing.facts.price.value.minimum}–${listing.facts.price.value.maximum}` : listing.facts.price.value.amount} USDC per Call. A fresh Quote confirms the buyer price.</p> : null}
      <section aria-labelledby="example-heading" className="grid min-w-0 gap-related border-t border-border pt-section">
        <h2 id="example-heading" className="text-title font-medium">Example</h2>
        {example === undefined ? <p className="text-sm text-muted-foreground">No example input is published for this Tool.</p> : <div className="grid min-w-0 gap-intra"><p className="text-sm text-muted-foreground">Published input: {example.label}</p><pre className="max-w-full overflow-x-auto rounded-card bg-muted p-gutter text-xs"><code>{JSON.stringify(example.input, null, 2)}</code></pre></div>}
        <p className="text-sm text-muted-foreground">No published output example. The output contract is under Technical.</p>
      </section>
      <details className="min-w-0 rounded-card border border-border"><summary className="min-h-touch cursor-pointer px-gutter py-related font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Technical · operation IDs, schemas and terms</summary><div className="min-w-0 border-t border-border p-gutter"><AeToolTechnicalContract tool={tool} /></div></details>
    </article>
  </AePublicPage>
}
