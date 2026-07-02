import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function readAnswerStyles(): string {
  return [
    readSource('src/styles/answer.css'),
    readSource('src/styles/answer/index.css'),
    readSource('src/styles/answer/shell.css'),
    readSource('src/styles/answer/query.css'),
    readSource('src/styles/answer/ai-elements.css'),
    readSource('src/styles/answer/panel.css'),
    readSource('src/styles/answer/source-card.css'),
    readSource('src/styles/answer/affordances.css'),
    readSource('src/styles/answer/chat-shell.css'),
    readSource('src/styles/answer/model-selector.css'),
    readSource('src/styles/answer/thread.css'),
    readSource('src/styles/answer/map.css'),
    readSource('src/styles/answer/listing.css'),
    readSource('src/styles/answer/motion.css'),
  ].join('\n')
}

describe('public chat layout contract', () => {
  it('mounts the home page through the chat shell', () => {
    const homeRoute = readSource('src/routes/index.tsx')

    expect(homeRoute).toMatch(/<AeChat\s/)
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

  it('uses daylight commerce button radius on public CTAs', () => {
    const button = readSource('src/components/ui/button.tsx')
    const globals = readSource('src/styles/globals.css')
    const answerStyles = readAnswerStyles()

    expect(button).toMatch(/rounded-\[var\(--ae-radius-md\)\]/)
    expect(button).not.toMatch(/rounded-full/)
    expect(globals).toMatch(/\.ae-button-landing-primary/)
    expect(globals).toMatch(/var\(--ae-public-radius-button\)/)
    expect(answerStyles).toMatch(/\.ae-thread-header\b[\s\S]*background: var\(--ae-public-field\)/)
    expect(answerStyles).not.toMatch(/backdrop-filter: blur\(8px\)/)
  })

  it('keeps the model selector out of the public query panel', () => {
    const queryPanel = readSource('src/components/ae/chat/AeQueryPanel.tsx')

    expect(queryPanel).not.toMatch(/AeModelSelector/)
    expect(queryPanel).not.toMatch(/import\.meta\.env\.DEV/)
  })

  it('keeps the public chat panel free of search-area chrome', () => {
    const chat = readSource('src/components/ae/chat/AeChat.tsx')
    const answerStyles = readAnswerStyles()

    expect(chat).toMatch(/DEFAULT_AE_SEARCH_CONTEXT/)
    expect(chat).not.toMatch(/<AeSearchContextBar\b/)
    expect(answerStyles).not.toMatch(/\.ae-search-context-bar\b/)
  })
})

describe('public listing layout contract', () => {
  it('mounts business citation pages through the daylight listing component', () => {
    const listingRoute = readSource('src/routes/$slug.tsx')

    expect(listingRoute).toMatch(/<AeProviderListingPage\b/)
    expect(listingRoute).not.toMatch(/AePublicLanding/)
    expect(listingRoute).not.toMatch(/AeAnswerRecordCard/)
    expect(listingRoute).not.toMatch(/AePublicRecordHero/)
  })

  it('keeps listing citation layout in answer.css primitives', () => {
    const listingSource = readSource('src/components/ae/listing/AeProviderListingPage.tsx')
    const answerStyles = readAnswerStyles()

    expect(listingSource).toMatch(/ae-listing-page/)
    expect(listingSource).toMatch(/ae-public-page/)
    expect(listingSource).toMatch(/ae-listing-sticky-rail/)
    expect(listingSource).not.toMatch(/AeStatusBadge/)
    expect(listingSource).not.toMatch(/ae-public-detail-hero/)
    expect(answerStyles).toMatch(/\.ae-listing-page\b/)
    expect(answerStyles).toMatch(/\.ae-listing-sticky-rail\b/)
  })

  it('surfaces trust on provider source cards', () => {
    const sourceCard = readSource('src/components/ae/landing/AeProviderSourceCard.tsx')

    expect(sourceCard).toMatch(/source\.trustCue/)
    expect(sourceCard).not.toMatch(/AeAgentJsonAffordance/)
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

  it('uses the sidebar command layout in AeOperatorShell', () => {
    const shell = readSource('src/components/ae/layout/AeOperatorShell.tsx')

    expect(shell).toMatch(/SidebarProvider/)
    expect(shell).toMatch(/AeOperatorSidebar/)
    expect(shell).toMatch(/AeOperatorSectionNav/)
  })
})
