import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('public chat layout contract', () => {
  it('splits the home landing from the query chat handoff', () => {
    const homeRoute = readSource('src/routes/index.tsx')

    expect(homeRoute).toMatch(/q\.length > 0/)
    expect(homeRoute).toMatch(/<AeChat\s/)
    expect(homeRoute).toMatch(/<AePublicShell>/)
    expect(homeRoute).toMatch(/<AeAnswerPromptInput\b/)
    expect(homeRoute).not.toMatch(/readPublicRegistryCatalogPage/)
    expect(homeRoute).not.toMatch(/AeProviderCard/)
    expect(homeRoute).not.toMatch(/AePublicLanding/)
    expect(homeRoute).not.toMatch(/ae-public-detail-hero/)
  })

  it('redirects legacy share links into the primary chat shell', () => {
    const answerRoute = readSource('src/routes/q.$answerId.tsx')

    expect(answerRoute).toMatch(/createFileRoute\('\/q\/\$answerId'\)/)
    expect(answerRoute).toMatch(/decodeAnswerId/)
    expect(answerRoute).toMatch(/redirect\(\{ to: '\/', search: \{ q: query \} \}\)/)
    expect(answerRoute).not.toMatch(/<AeChat\s/)
    expect(answerRoute).not.toMatch(/<AeAnswerStream\s/)
  })

  it('keeps welcome copy plain and conversion-honest', () => {
    const welcome = readSource('src/components/ae/chat/AeChatWelcome.tsx')

    expect(welcome).toMatch(/Ask for a local service/)
    expect(welcome).not.toMatch(/source-owned|readback|KNOWN|UNKNOWN/i)
    expect(welcome).toMatch(/See who fits/)
  })

  it('scopes streaming status without flooding the whole answer region', () => {
    const streamSection = readSource('src/components/ae/chat/AeThreadTurnStreamSection.tsx')

    expect(streamSection).not.toMatch(/aria-live="polite"/)
    expect(streamSection).toMatch(/AeGenerativeAnswer/)
  })

  it('defaults scroll follow off and reopens threads at last anchor', () => {
    const scroller = readSource('src/components/ae/chat/AeThreadScroller.tsx')
    const chat = readSource('src/components/ae/chat/AeChat.tsx')
    const transcript = readSource('src/components/ae/chat/AeThreadTranscript.tsx')

    expect(scroller).toMatch(/autoScroll = false/)
    expect(scroller).toMatch(/defaultScrollPosition = 'end'/)
    expect(scroller).toMatch(/scrollPreviousItemPeek=\{AE_THREAD_SCROLL_PREVIOUS_PEEK_PX\}/)
    expect(scroller).toMatch(/Jump to latest/)
    expect(chat).toMatch(/autoScroll=\{liveTurn !== null\}/)
    expect(chat).toMatch(/defaultScrollPosition=\{defaultScrollPosition\}/)
    expect(chat).toMatch(/last-anchor/)
    expect(transcript).toMatch(/scrollAnchor=\{anchorThisTurn\}/)
  })

  it('routes public CTAs directly through Astryx components', () => {
    const shell = readSource('src/components/ae/layout/AePublicShell.tsx')
    const answerPrompt = readSource('src/components/ae/chat/AeAnswerPromptInput.tsx')
    const threadHeader = readSource('src/components/ae/chat/AeThreadHeader.tsx')

    expect(shell).toMatch(/@astryxdesign\/core\/Button/)
    expect(answerPrompt).toMatch(/@astryxdesign\/core\/Chat/)
    expect(shell).not.toMatch(/class-variance-authority|cva\(/)
    expect(answerPrompt).not.toMatch(/@\/components\/ai-elements\/prompt-input/)
    expect(threadHeader).toMatch(/sticky/)
    expect(threadHeader).toMatch(/bg-body/)
    expect(threadHeader).toMatch(/border-b border-border/)
    expect(threadHeader).not.toMatch(/backdrop-blur|backdrop-filter/)
  })

  it('keeps the model selector out of the public query panel', () => {
    const queryPanel = readSource('src/components/ae/chat/AeQueryPanel.tsx')

    expect(queryPanel).not.toMatch(/AeModelSelector/)
    expect(queryPanel).not.toMatch(/import\.meta\.env\.DEV/)
  })

  it('keeps the public chat panel free of search-area chrome', () => {
    const chat = readSource('src/components/ae/chat/AeChat.tsx')

    expect(chat).toMatch(/DEFAULT_AE_SEARCH_CONTEXT/)
    expect(chat).not.toMatch(/<AeSearchContextBar\b/)
  })
})

describe('public listing layout contract', () => {
  it('mounts business citation pages through the Astryx-era listing component', () => {
    const listingRoute = readSource('src/routes/$slug.tsx')

    expect(listingRoute).toMatch(/<AeProviderListingPage\b/)
    expect(listingRoute).not.toMatch(/AePublicLanding/)
    expect(listingRoute).not.toMatch(/AeAnswerRecordCard/)
    expect(listingRoute).not.toMatch(/AePublicRecordHero/)
  })

  it('keeps listing citation layout on Astryx primitives', () => {
    const listingSource = readSource('src/components/ae/listing/AeProviderListingPage.tsx')

    expect(listingSource).toMatch(/@astryxdesign\/core\/Card/)
    expect(listingSource).toMatch(/@astryxdesign\/core\/Button/)
    expect(listingSource).toMatch(/@astryxdesign\/core\/Badge/)
    expect(listingSource).toMatch(/AeProtectedByAe/)
    expect(listingSource).toMatch(/AeAgentJsonAffordance/)
    expect(listingSource).not.toMatch(/AeStatusBadge/)
    expect(listingSource).not.toMatch(/ae-public-detail-hero/)
    expect(listingSource).not.toMatch(/ae-listing-page/)
  })

  it('surfaces trust on provider source cards', () => {
    const sourceCard = readSource('src/components/ae/primitives/AeProviderCard.tsx')

    expect(sourceCard).toMatch(/source\.trustCue/)
    expect(sourceCard).not.toMatch(/AeAgentJsonAffordance/)
  })

  it('keeps answer-origin context through public inquiry entry', () => {
    const answer = readSource('src/components/ae/artifacts/AeGenerativeAnswer.tsx')
    const providerCard = readSource('src/components/ae/primitives/AeProviderCard.tsx')
    const inquiryRoute = readSource('src/routes/$slug.inquiry.tsx')
    const listing = readSource('src/components/ae/listing/AeProviderListingPage.tsx')

    expect(answer).toMatch(/from=thread&id=/)
    expect(providerCard).toMatch(/from=thread&id=/)
    expect(listing).toMatch(/appendThreadOrigin/)
    expect(inquiryRoute).toMatch(/validateSearch/)
    expect(inquiryRoute).toMatch(/From your answer/)
    expect(inquiryRoute).toMatch(/continues \{readback\.businessName\} from your answer thread/)
    expect(inquiryRoute).toMatch(/Back to answer/)
  })
})

describe('operator shell contract', () => {
  const operatorRoutes = [
    'src/routes/owner.status.tsx',
    'src/routes/owner.actions.tsx',
    'src/routes/owner.actions.$proposalId.tsx',
    'src/routes/owner.actions.$proposalId.receipt.tsx',
    'src/routes/owner.inquiries.tsx',
    'src/routes/owner.inquiries.$threadId.tsx',
    'src/routes/owner.business-actions.tsx',
    'src/routes/owner.business-actions.$requestId.tsx',
    'src/routes/owner.business-actions.$requestId.receipt.tsx',
    'src/routes/admin.claims.tsx',
    'src/routes/admin.audit-events.tsx',
    'src/routes/admin.index-health.tsx',
    'src/routes/admin.business-actions.tsx',
    'src/routes/admin.business-actions.$requestId.tsx',
    'src/routes/admin.protected-actions.tsx',
    'src/routes/admin.protected-actions.$proposalId.tsx',
    'src/routes/admin.inquiries.tsx',
    'src/routes/developers.discovery.tsx',
  ]

  it.each(operatorRoutes)('%s uses AeOperatorShell and not the public/admin shells', (routePath) => {
    const source = readSource(routePath)

    expect(source).toMatch(/<AeOperatorShell\b/)
    expect(source).not.toMatch(/<AePublicShell\b/)
    expect(source).not.toMatch(/<AeAdminShell\b/)
  })

  it('uses the Astryx-era operator command layout in AeOperatorShell', () => {
    const shell = readSource('src/components/ae/layout/AeOperatorShell.tsx')

    expect(shell).toMatch(/AeOperatorSidebar/)
    expect(shell).toMatch(/AeOperatorSectionNav/)
    expect(shell).toMatch(/AeOperatorCommandMenu/)
    expect(shell).toMatch(/@astryxdesign\/core\/Divider/)
    expect(shell).not.toMatch(/SidebarProvider/)
  })
})
