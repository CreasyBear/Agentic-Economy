import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { verifyHostedCustomerRequestRelease } from '../../tools/release/verify-customer-request-release'
import {
  buildComparisonBrief,
  comparisonPresentationDigest,
  type OfferingComparisonResult,
} from '../../src/modules/comparison/public'
import { applyVercelProtectionBypassToPage, vercelProtectionBypassHeaders } from './vercel-bypass'

const coldStartQuery =
  'I run a small startup in Perth and need a simple website. I would prefer someone local or an affordable freelancer. Who should I consider, and roughly what should I expect to pay?'

const requiredCommands = [
  'npm run verify:phase5:release-source',
  'npm run verify:phase5:browser',
  'npm run check:convex-codegen',
  'test -z "$(git status --porcelain=v1 --untracked-files=all)"',
]

test('authenticated exact-revision deployment serves the public zero-effect comparison loop', async ({ page, request }) => {
  test.setTimeout(180_000)
  const config = configuration()
  mkdirSync(config.artifactDirectory, { recursive: true })

  await verifyHostedCustomerRequestRelease({
    baseUrl: config.baseUrl.href,
    apiKey: config.smokeAuth,
    expectedRevision: config.revision,
    expectedDeploymentId: config.deploymentId,
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() === undefined
      ? {}
      : { deploymentProtectionBypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET.trim() }),
  })

  const observedRequests: string[] = []
  page.on('request', (observed) => {
    observedRequests.push(`${observed.method()} ${new URL(observed.url()).pathname}`)
  })
  await applyVercelProtectionBypassToPage(page, config.baseUrl)

  await page.goto(new URL('/', config.baseUrl).href, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'What do you need done?' })).toBeVisible()
  const search = page.getByRole('search', { name: /find local service businesses/i })
  await search.getByRole('searchbox').fill(coldStartQuery)
  await search.getByRole('button', { name: /^find businesses$/i }).click()
  await page.waitForURL(/\/t\//)
  const brochureChoice = page.getByRole('button', { name: 'Information and enquiries' })
  await expect(brochureChoice).toBeVisible()
  // The clarification can render before the route-owned thread continuation is
  // mounted. Wait for that real boundary instead of racing a disabled choice.
  await expect(brochureChoice).toBeEnabled({ timeout: 60_000 })
  await brochureChoice.click()
  await expect(page.getByRole('region', { name: 'Decision support' })).toBeVisible({ timeout: 30_000 })
  const browseHref = await page.getByRole('link', { name: 'Browse registered supply' }).getAttribute('href')
  expect(browseHref).toMatch(/q=.*information.*enquiries/iu)

  await page.goto(new URL(browseHref!, config.baseUrl).href, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1, name: /results for/iu })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No published Offerings match this search' })).toBeVisible()

  for (const detailUrl of config.detailUrls) {
    await page.goto(new URL(detailUrl, config.baseUrl).href, { waitUntil: 'networkidle' })
    await expect(page.getByRole('main')).toContainText(/Published by the business|Offering/iu)
  }

  const compareUrl = combinedCompareUrl(config.baseUrl, config.selections)
  await page.goto(compareUrl.href, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1, name: 'Compare Offerings' })).toBeVisible()
  await expect(page.getByText('4 of 4 selected').first()).toBeVisible()
  await expect(page.getByText('Local demo evidence', { exact: true })).toBeVisible()

  const response = await request.post(new URL('/api/compare', config.baseUrl).href, {
    headers: vercelProtectionBypassHeaders(),
    data: {
      selections: config.selections.map((selection) => ({
        businessId: selection.businessId,
        offeringRef: selection.offeringRef,
        offeringRevision: selection.revision,
        projectionObservedAt: selection.projectionObservedAt,
      })),
      priorities: [],
    },
  })
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe('no-store')
  const structuredResult: unknown = await response.json()
  const structuredComparison = structuredResult as OfferingComparisonResult
  const structuredSemanticDigest = comparisonPresentationDigest({
    comparison: structuredComparison,
    brief: buildComparisonBrief(structuredComparison),
  })

  const mainText = await page.getByRole('main').innerText()
  const humanSemanticDigest = await page.getByRole('main').getAttribute('data-semantic-digest')
  expect(humanSemanticDigest).toBe(structuredSemanticDigest)
  expect(mainText).toMatch(/Nothing here contacts a business or runs an endpoint/iu)
  const humanPath = join(config.artifactDirectory, 'human-loader-response.json')
  const structuredPath = join(config.artifactDirectory, 'structured-post-response.json')
  const zeroEffectPath = join(config.artifactDirectory, 'zero-effect-observation.json')
  const screenshotPath = join(config.artifactDirectory, 'comparison.png')
  writeOnce(humanPath, JSON.stringify({
    semanticDigest: humanSemanticDigest,
    renderedTextDigest: digest(mainText),
    selectedCount: config.selections.length,
  }))
  writeOnce(structuredPath, JSON.stringify({
    semanticDigest: structuredSemanticDigest,
    response: structuredResult,
  }))

  const allowedRequests = [...new Set([...observedRequests, 'POST /api/compare'])]
  const inspectOnlyPosts = new Set(['/api/answer/turn', '/api/compare'])
  const effectfulRequests = allowedRequests.filter((entry) => {
    const [method, pathname] = entry.split(' ', 2)
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false
    return !(method === 'POST' && inspectOnlyPosts.has(pathname ?? ''))
  })
  expect(effectfulRequests).toEqual([])
  writeOnce(zeroEffectPath, JSON.stringify({
    schemaVersion: 'ae.consumer-comparison-zero-effect:v1',
    observer: 'playwright:consumer-comparison-network-observation:v1',
    allowedRequests,
    effectfulRequests,
    observedAt: new Date().toISOString(),
  }))
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const inputPath = join(config.artifactDirectory, 'consumer-comparison-evidence-input.json')
  writeOnce(inputPath, `${JSON.stringify({
    source: {
      cwd: process.cwd(),
      expectedRevision: config.revision,
      expectedTree: config.tree,
    },
    deployment: {
      baseUrl: config.baseUrl.origin,
      expectedDeploymentId: config.deploymentId,
      smokeAuth: '',
    },
    data: {
      label: 'labelled_demo',
      seedVersion: config.seedVersion,
      selections: config.selections.map((selection) => ({
        ...selection,
        dataLabel: 'labelled_demo',
        canonicalUrl: compareUrl.href,
      })),
    },
    artifacts: {
      humanLoaderResponse: humanPath,
      structuredPostResponse: structuredPath,
      zeroEffectObservation: zeroEffectPath,
      screenshots: [{ state: 'unranked', path: screenshotPath }],
    },
    commands: requiredCommands,
    firstFailures: [],
  }, null, 2)}\n`)
})

type Selection = {
  businessId: string
  offeringRef: string
  revision: number
  projectionObservedAt: number
  profileVersion: 'professional_service:v1' | 'machine_data:v1'
}

function configuration(): {
  baseUrl: URL
  revision: string
  tree: string
  deploymentId: string
  smokeAuth: string
  seedVersion: string
  selections: Selection[]
  detailUrls: string[]
  artifactDirectory: string
} {
  const baseUrl = new URL(required('CONSUMER_COMPARISON_BASE_URL'))
  if (baseUrl.protocol !== 'https:') throw new Error('CONSUMER_COMPARISON_BASE_URL_https_required')
  const selections = parseArray<Selection>('CONSUMER_COMPARISON_SELECTIONS_JSON')
  if (selections.length < 4) throw new Error('CONSUMER_COMPARISON_SELECTIONS_JSON_requires_four')
  const detailUrls = parseArray<string>('CONSUMER_COMPARISON_DETAIL_URLS_JSON')
  if (detailUrls.length < 4) throw new Error('CONSUMER_COMPARISON_DETAIL_URLS_JSON_requires_four')
  return {
    baseUrl,
    revision: required('CONSUMER_COMPARISON_EXPECTED_REVISION'),
    tree: required('CONSUMER_COMPARISON_EXPECTED_TREE'),
    deploymentId: required('CONSUMER_COMPARISON_DEPLOYMENT_ID'),
    smokeAuth: required('CONSUMER_COMPARISON_SMOKE_AUTH'),
    seedVersion: required('CONSUMER_COMPARISON_SEED_VERSION'),
    selections,
    detailUrls,
    artifactDirectory: required('CONSUMER_COMPARISON_ARTIFACT_DIR'),
  }
}

function combinedCompareUrl(baseUrl: URL, selections: Selection[]): URL {
  const url = new URL('/compare', baseUrl)
  for (const selection of selections) {
    url.searchParams.append('selection', JSON.stringify({
      businessId: selection.businessId,
      offeringRef: selection.offeringRef,
      offeringRevision: selection.revision,
      projectionObservedAt: selection.projectionObservedAt,
    }))
  }
  return url
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value.length === 0) throw new Error(`${name}_required`)
  return value
}

function parseArray<T>(name: string): T[] {
  const value: unknown = JSON.parse(required(name))
  if (!Array.isArray(value)) throw new Error(`${name}_must_be_array`)
  return value as T[]
}

function writeOnce(path: string, content: string): void {
  try {
    writeFileSync(path, content, { flag: 'wx' })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new Error(`evidence_artifact_already_exists:${path}`)
    }
    throw error
  }
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
