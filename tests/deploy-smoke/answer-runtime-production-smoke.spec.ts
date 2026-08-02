import { randomUUID } from 'node:crypto'

import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test'
import type { PublicBusinessCatalogApiV2Dto } from '../../src/modules/registry/public'

import {
  applyVercelProtectionBypassToPage,
  newVercelBypassedRequestContext,
} from './vercel-bypass'

type CatalogPage = {
  page: readonly PublicBusinessCatalogApiV2Dto[]
  isDone: boolean
  continueCursor: string
}

type PublicThreadTurnReadback = {
  query: string
  status: string
  artifacts: readonly unknown[]
  workLog: readonly unknown[]
}

type PublicThreadReadback = {
  threadId: string
  turns: readonly PublicThreadTurnReadback[]
}

const ANSWER_SERVICE_SIGNAL = /\b(?:accountant|accounting|aged care|cleaner|cleaning|dentist|dental|electrician|electrical|family lawyer|hvac|lawyer|locksmith|math tutor|photographer|plumber|plumbing|repair|repairs|tutor|tutoring)\b/i
const FORBIDDEN_PUBLIC_EFFECT_CLAIM = /\b(?:book(?:ing)? confirmed|pay now|payment required|payment (?:taken|processed)|charged|provider dispatched|dispatch confirmed|appointment confirmed|work completed|request sent)\b/i
const FORBIDDEN_PRIVATE_PUBLIC_EVIDENCE = /\b(?:harnessRun|harnessFinalization|snapshotHash|resultHash|inputJson|resultJson|sourceHash|ownerId|clerkUserId)\b/i


test('runtime-selected direct and model-recovery answer paths stay public and read-only', async ({ page }) => {
  test.setTimeout(240_000)

  const startedAt = timestamp()
  const baseUrl = requiredBaseUrl()
  const catalogUrl = absoluteUrl(baseUrl, '/api/businesses')
  const selectionSeed = readSelectionSeed()
  console.log(`[answer-runtime-production-smoke] AE_SMOKE_SELECTION_SEED=${selectionSeed}`)

  const timestamps = {
    startedAt,
    catalogFetchedAt: '',
    directTerminalAt: '',
    directReadbackAt: '',
    modelTerminalAt: '',
    modelReadbackAt: '',
    finishedAt: '',
  }

  await applyVercelProtectionBypassToPage(page, baseUrl)
  const api = await newVercelBypassedRequestContext(request, baseUrl)

  try {
    const catalog = await fetchCatalog(api, baseUrl)
    timestamps.catalogFetchedAt = timestamp()
    const subject = selectSubject(catalog, selectionSeed)
    const exactQuery = exactCategoryLocalityQuery(subject)
    const modelQuery = await findLiteralMiss(api, baseUrl, subject)

    const directThreadUrl = await submitQuery(page, baseUrl, exactQuery)
    await assertTerminalAnswer(page, subject, exactQuery)
    timestamps.directTerminalAt = timestamp()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await assertTerminalAnswer(page, subject, exactQuery)
    const directReadback = await readPublicThread(api, baseUrl, directThreadUrl, exactQuery, subject.slug)
    expect(directReadback.recoverySearchObserved).toBe(false)
    timestamps.directReadbackAt = timestamp()

    const modelThreadUrl = await submitQuery(page, baseUrl, modelQuery)
    await assertTerminalAnswer(page, subject, modelQuery)
    timestamps.modelTerminalAt = timestamp()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await assertTerminalAnswer(page, subject, modelQuery)
    const modelReadback = await readPublicThread(api, baseUrl, modelThreadUrl, modelQuery, subject.slug)
    // This is the public, sanitized recovery work-log only. Private model/tool counts stay in route/eval evidence.
    expect(modelReadback.recoverySearchObserved).toBe(true)
    timestamps.modelReadbackAt = timestamp()

    timestamps.finishedAt = timestamp()
    console.log(JSON.stringify({
      kind: 'answer-runtime-production-smoke-receipt',
      seed: selectionSeed,
      selectedSlug: subject.slug,
      catalogUrl,
      threadUrls: [directThreadUrl, modelThreadUrl],
      timestamps,
    }))
  } finally {
    await api.dispose()
  }
})

async function fetchCatalog(api: APIRequestContext, baseUrl: URL): Promise<readonly PublicBusinessCatalogApiV2Dto[]> {
  const businesses: PublicBusinessCatalogApiV2Dto[] = []
  let cursor: string | undefined

  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const url = new URL('/api/businesses', baseUrl)
    url.searchParams.set('limit', '50')
    if (cursor !== undefined) url.searchParams.set('cursor', cursor)

    const response = await api.get(url.href)
    if (!response.ok()) throw new Error(`catalog_request_failed:${response.status()}`)
    const page = parseCatalogPage(await response.json().catch(() => undefined))
    businesses.push(...page.page)
    if (page.isDone) return businesses

    const nextCursor = page.continueCursor.trim()
    if (nextCursor.length === 0 || nextCursor === cursor) throw new Error('catalog_pagination_cursor_invalid')
    cursor = nextCursor
  }

  throw new Error('catalog_pagination_limit_exceeded')
}

async function findLiteralMiss(
  api: APIRequestContext,
  baseUrl: URL,
  subject: PublicBusinessCatalogApiV2Dto,
): Promise<string> {
  for (const query of boundedTypoQueries(subject)) {
    const url = new URL('/api/businesses/search', baseUrl)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '3')
    const response = await api.get(url.href)
    if (!response.ok()) throw new Error(`literal_typo_search_failed:${response.status()}`)
    const page = parseSearchPage(await response.json().catch(() => undefined))
    if (page.items.length === 0) return query
  }

  throw new Error('no_bounded_literal_miss_for_selected_subject')
}

async function submitQuery(page: Page, baseUrl: URL, query: string): Promise<string> {
  await page.goto(absoluteUrl(baseUrl, '/'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('search', { name: /find local service businesses/i })).toBeVisible({ timeout: 30_000 })

  const searchbox = page.getByRole('searchbox', { name: /what do you need done/i }).last()
  await expect(searchbox).toBeEditable({ timeout: 30_000 })
  await searchbox.fill(query)
  await expect(searchbox).toHaveValue(query)

  const submit = page.getByRole('button', { name: /^(?:search|send)$/i }).last()
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(page).toHaveURL(/\/t\/[^/]+/u, { timeout: 30_000 })
  await expectQueryInTranscript(page, query)
  return page.url()
}

async function assertTerminalAnswer(page: Page, subject: PublicBusinessCatalogApiV2Dto, query: string): Promise<void> {
  await expectQueryInTranscript(page, query)
  await expect(page.locator('section[data-phase="complete"]').last()).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('Answer ready.', { exact: true }).last()).toBeVisible({ timeout: 30_000 })

  const citation = page.getByRole('link', { name: subject.name, exact: true }).first()
  await expect(citation).toBeVisible({ timeout: 30_000 })
  const href = await citation.getAttribute('href')
  expect(href).not.toBeNull()
  expect(new URL(href as string, page.url()).pathname).toBe(`/${subject.slug}`)

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).toMatch(/business still confirms timing, quote, and availability/i)
  expect(bodyText).not.toMatch(FORBIDDEN_PUBLIC_EFFECT_CLAIM)
  expect(bodyText).not.toMatch(FORBIDDEN_PRIVATE_PUBLIC_EVIDENCE)
}

async function expectQueryInTranscript(page: Page, query: string): Promise<void> {
  await expect(
    page.getByRole('log', { name: /chat transcript/i }).getByText(query, { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 })
}

async function readPublicThread(
  api: APIRequestContext,
  baseUrl: URL,
  threadUrl: string,
  query: string,
  slug: string,
): Promise<{ recoverySearchObserved: boolean }> {
  const threadId = threadIdFromUrl(threadUrl)
  const endpoint = new URL(`/api/answer/threads/${encodeURIComponent(threadId)}`, baseUrl)
  const response = await api.get(endpoint.href)
  if (!response.ok()) throw new Error(`thread_readback_failed:${response.status()}`)

  const projection = parsePublicThread(await response.json().catch(() => undefined))
  expect(projection.threadId).toBe(threadId)
  const latest = projection.turns.at(-1)
  if (latest === undefined) throw new Error('thread_readback_missing_terminal_turn')
  expect(latest.query).toBe(query)
  expect(latest.status).toBe('complete')
  expect(citedSlugs(latest.artifacts)).toContain(slug)
  expect(JSON.stringify(projection)).not.toMatch(FORBIDDEN_PRIVATE_PUBLIC_EVIDENCE)

  return {
    recoverySearchObserved: latest.workLog.some((step) => (
      isRecord(step) && step.title === 'Trying another listed-business search'
    )),
  }
}

function selectSubject(
  businesses: readonly PublicBusinessCatalogApiV2Dto[],
  seed: string,
): PublicBusinessCatalogApiV2Dto {
  // /api/businesses is already the public publication boundary; selection uses only its public projection.
  const published = businesses.filter((business) => (
    business.slug.trim().length > 0
    && business.name.trim().length > 0
    && business.category.trim().length > 0
    && business.suburb.trim().length > 0
    && business.stateTerritory.trim().length > 0
    && business.offerings.length > 0
  ))
  const pairCounts = new Map<string, number>()
  for (const business of published) {
    const key = categoryLocalityKey(business.category, business.suburb, business.stateTerritory)
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
  }

  const eligible = published.filter((business) => (
    pairCounts.get(categoryLocalityKey(business.category, business.suburb, business.stateTerritory)) === 1
    && ANSWER_SERVICE_SIGNAL.test(business.category)
  ))
  expect(eligible.length, 'live catalog has no unique service/category locality subject').toBeGreaterThan(0)
  return eligible[seedHash(seed) % eligible.length] as PublicBusinessCatalogApiV2Dto
}

function exactCategoryLocalityQuery(subject: PublicBusinessCatalogApiV2Dto): string {
  return [subject.category, subject.suburb, subject.stateTerritory]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ')
}

function boundedTypoQueries(subject: PublicBusinessCatalogApiV2Dto): readonly string[] {
  const variants = [
    typoAllServiceWords(subject.category),
    ...typoVariants(subject.category).filter((category) => !ANSWER_SERVICE_SIGNAL.test(category)),
  ]
  const fallback = variants.filter((category) => category.trim().length > 0)
  return [...new Set((fallback.length > 0 ? fallback : [`${subject.category.trim()}x`]).slice(0, 6).map((category) => (
    [category, subject.suburb, subject.stateTerritory]
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join(' ')
  )))]
}

function typoAllServiceWords(value: string): string {
  const words = value.trim().split(/\s+/u).filter((word) => word.length > 0)
  const damaged = words.map((word) => {
    const variant = typoVariants(word).find((candidate) => !ANSWER_SERVICE_SIGNAL.test(candidate))
    return variant ?? `${word}x`
  })
  const result = damaged.join(' ')
  return ANSWER_SERVICE_SIGNAL.test(result) ? words.map((word) => `${word}x`).join(' ') : result
}

function typoVariants(value: string): string[] {
  const words = value.trim().split(/\s+/u).filter((word) => word.length > 0)
  const orderedWordIndexes = words
    .map((word, index) => ({ word, index }))
    .sort((left, right) => right.word.length - left.word.length)
    .map(({ index }) => index)
  const variants: string[] = []

  for (const wordIndex of orderedWordIndexes) {
    const word = words[wordIndex]
    if (word === undefined) continue
    const chars = [...word]

    for (let index = 1; index < chars.length - 1; index += 1) {
      variants.push(replaceWord(words, wordIndex, chars.slice(0, index).concat(chars.slice(index + 1)).join('')))
    }
    for (let index = 1; index < chars.length - 1; index += 1) {
      if (chars[index] === chars[index + 1]) continue
      const swapped = [...chars]
      const next = swapped[index + 1]
      swapped[index + 1] = swapped[index] as string
      swapped[index] = next as string
      variants.push(replaceWord(words, wordIndex, swapped.join('')))
    }
    if (chars.length >= 2) {
      const swapped = [...chars]
      const next = swapped[1]
      swapped[1] = swapped[0] as string
      swapped[0] = next as string
      variants.push(replaceWord(words, wordIndex, swapped.join('')))
    }
  }

  return [...new Set(variants)].filter((variant) => variant !== value.trim())
}

function replaceWord(words: readonly string[], index: number, replacement: string): string {
  return words.map((word, wordIndex) => wordIndex === index ? replacement : word).join(' ')
}

function categoryLocalityKey(category: string, suburb: string, stateTerritory: string): string {
  return [category, suburb, stateTerritory].map(normalizeKeyPart).join('\u0000')
}

function normalizeKeyPart(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, ' ')
}

function citedSlugs(artifacts: readonly unknown[]): readonly string[] {
  const slugs: string[] = []
  for (const artifact of artifacts) {
    if (!isRecord(artifact)) continue
    if (artifact.kind === 'selected-provider') {
      const provider = isRecord(artifact.provider) ? artifact.provider : undefined
      if (typeof provider?.slug === 'string') slugs.push(provider.slug)
      continue
    }
    if (artifact.kind !== 'provider-cards' && artifact.kind !== 'provider-compare-table') continue
    if (!Array.isArray(artifact.providers)) continue
    for (const provider of artifact.providers) {
      if (isRecord(provider) && typeof provider.slug === 'string') slugs.push(provider.slug)
    }
  }
  return slugs
}

function parseCatalogPage(value: unknown): CatalogPage {
  if (!isRecord(value)
    || value.kind !== 'ok'
    || value.schemaVersion !== 'public-business-catalog-api:v2'
    || typeof value.isDone !== 'boolean'
    || typeof value.continueCursor !== 'string'
    || !Array.isArray(value.page)
    || !value.page.every(isPublicBusiness)) {
    throw new Error('catalog_response_shape_invalid')
  }
  return {
    page: value.page as PublicBusinessCatalogApiV2Dto[],
    isDone: value.isDone,
    continueCursor: value.continueCursor,
  }
}

function parseSearchPage(value: unknown): { items: readonly unknown[] } {
  if (!isRecord(value) || value.kind !== 'ok' || !Array.isArray(value.items)) {
    throw new Error('search_response_shape_invalid')
  }
  return { items: value.items }
}

function parsePublicThread(value: unknown): PublicThreadReadback {
  if (!isRecord(value) || typeof value.threadId !== 'string' || !Array.isArray(value.turns)) {
    throw new Error('thread_readback_shape_invalid')
  }
  const turns: PublicThreadTurnReadback[] = []
  for (const turn of value.turns) {
    if (!isRecord(turn)
      || typeof turn.query !== 'string'
      || typeof turn.status !== 'string'
      || !Array.isArray(turn.artifacts)
      || !Array.isArray(turn.workLog)) {
      throw new Error('thread_turn_readback_shape_invalid')
    }
    turns.push({
      query: turn.query,
      status: turn.status,
      artifacts: turn.artifacts,
      workLog: turn.workLog,
    })
  }
  return { threadId: value.threadId, turns }
}

function isPublicBusiness(value: unknown): value is PublicBusinessCatalogApiV2Dto {
  if (!isRecord(value)
    || typeof value.slug !== 'string'
    || typeof value.name !== 'string'
    || typeof value.category !== 'string'
    || typeof value.suburb !== 'string'
    || typeof value.stateTerritory !== 'string'
    || !Array.isArray(value.offerings)
    || value.offerings.length === 0) {
    return false
  }
  return value.offerings.every((offering) => (
    isRecord(offering)
    && typeof offering.name === 'string'
    && typeof offering.category === 'string'
  ))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function threadIdFromUrl(value: string): string {
  const pathname = new URL(value).pathname
  const match = pathname.match(/^\/t\/([^/]+)$/u)
  if (match?.[1] === undefined) throw new Error('thread_url_invalid')
  return decodeURIComponent(match[1])
}

function requiredBaseUrl(): URL {
  const configured = process.env.PLAYWRIGHT_BASE_URL?.trim()
  if (configured === undefined || configured.length === 0) throw new Error('PLAYWRIGHT_BASE_URL_required')
  const url = new URL(configured)
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('PLAYWRIGHT_BASE_URL_https_required')
  }
  if (url.username.length > 0 || url.password.length > 0 || url.search.length > 0 || url.hash.length > 0) {
    throw new Error('PLAYWRIGHT_BASE_URL_must_not_contain_credentials_or_query')
  }
  return url
}

function absoluteUrl(baseUrl: URL, path: string): string {
  return new URL(path, baseUrl).href
}

function readSelectionSeed(): string {
  const supplied = process.env.AE_SMOKE_SELECTION_SEED?.trim()
  return supplied === undefined || supplied.length === 0 ? randomUUID() : supplied
}

function seedHash(seed: string): number {
  let hash = 2_166_136_261
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function timestamp(): string {
  return new Date().toISOString()
}
