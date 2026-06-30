import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function exportedFunctionSource(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}`)
  expect(start).toBeGreaterThanOrEqual(0)

  const nextExport = source.indexOf('\nexport function ', start + 1)
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport)
}

describe('public landing layout contract', () => {
  it('keeps answer-part visual roles data-driven instead of order-coupled', () => {
    const globalStyles = readSource('src/styles/globals.css')

    expect(globalStyles).not.toMatch(/\.ae-public-answer-part[^{}]*:nth-child\s*\(/)
  })

  it('emits stable emphasis attributes from AeSignalGrid', () => {
    const landingSource = readSource('src/components/ae/landing/AePublicLanding.tsx')
    const signalGrid = exportedFunctionSource(landingSource, 'AeSignalGrid')

    expect(signalGrid).toMatch(/items\.map\(\(\{[^}]*\bemphasis\b[^}]*\}\)\s*=>/)
    expect(signalGrid).toContain('className="ae-public-answer-part"')
    expect(signalGrid).toContain('data-emphasis={emphasis}')
  })

  it('keeps repeated list items out of reveal animation classes', () => {
    const landingSource = readSource('src/components/ae/landing/AePublicLanding.tsx')
    const listItemTags = landingSource.match(/<(?:article|div|li)\b[^>]*\brole="listitem"[^>]*>/g) ?? []

    expect(listItemTags.length).toBeGreaterThan(0)
    expect(listItemTags.filter((tag) => tag.includes('ae-public-reveal'))).toEqual([])
  })

  it('mounts the public landing page as a query to generative answer surface', () => {
    const homeRoute = readSource('src/routes/index.tsx')

    // Home does one job: prompt the ask. The cited answer lives on /q/$answerId.
    expect(homeRoute).toMatch(/<AeQueryBox\s/)
    expect(homeRoute).toMatch(/<AeHandDrawnHero\s/)
    expect(homeRoute).toMatch(/to: '\/q\/\$answerId'/)
    expect(homeRoute).not.toMatch(/<AeAnswerStream\s/)
    expect(homeRoute).not.toMatch(/ae-hero-warm/)
    expect(homeRoute).not.toMatch(/<AeNoScrollLanding/)
  })

  it('mounts the shareable answer page with the streaming answer surface', () => {
    const answerRoute = readSource('src/routes/q.$answerId.tsx')

    expect(answerRoute).toMatch(/createFileRoute\('\/q\/\$answerId'\)/)
    expect(answerRoute).toMatch(/<AeAnswerStream\s/)
    expect(answerRoute).toMatch(/decodeAnswerId/)
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
})
