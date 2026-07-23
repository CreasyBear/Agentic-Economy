import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { verifyHostedCustomerRequestRelease } from '../../tools/release/verify-customer-request-release'
import { applyVercelProtectionBypassToPage, vercelProtectionBypassHeaders } from './vercel-bypass'

const requiredCommands = [
  'npm exec -- vitest run phase-05-focused-matrix',
  'npm exec -- playwright test phase-05-browser-matrix',
  'npm run test:copy',
  'npm run test:seo',
  'npm run test:imports',
  'npm run check:convex-codegen',
  'npm run typecheck',
  'npm run build',
  'git clean-tree-check',
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
  await page.goto(new URL('/registry?q=&limit=10', config.baseUrl).href, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: /find businesses and offerings/i })).toBeVisible()

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
  const semanticDigest = digest(stableJson(structuredResult))

  const mainText = await page.getByRole('main').innerText()
  expect(mainText).toMatch(/Nothing here contacts a business or runs an endpoint/iu)
  const humanPath = join(config.artifactDirectory, 'human-loader-response.json')
  const structuredPath = join(config.artifactDirectory, 'structured-post-response.json')
  const zeroEffectPath = join(config.artifactDirectory, 'zero-effect-observation.json')
  const screenshotPath = join(config.artifactDirectory, 'comparison.png')
  writeOnce(humanPath, JSON.stringify({
    semanticDigest,
    renderedTextDigest: digest(mainText),
    selectedCount: config.selections.length,
  }))
  writeOnce(structuredPath, JSON.stringify({ semanticDigest, response: structuredResult }))

  const allowedRequests = [...new Set([...observedRequests, 'POST /api/compare'])]
  const effectfulRequests = allowedRequests.filter((entry) => {
    const [method, pathname] = entry.split(' ', 2)
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false
    return !(method === 'POST' && pathname === '/api/compare')
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
        canonicalUrl: singleSelectionUrl(config.baseUrl, selection).href,
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

function singleSelectionUrl(baseUrl: URL, selection: Selection): URL {
  const url = new URL('/compare', baseUrl)
  url.searchParams.append('selection', JSON.stringify({
    businessId: selection.businessId,
    offeringRef: selection.offeringRef,
    offeringRevision: selection.revision,
    projectionObservedAt: selection.projectionObservedAt,
  }))
  return url
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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
