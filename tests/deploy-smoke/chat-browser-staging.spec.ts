import { expect, request, test, type Locator, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'

import { parseHttpsUrl, resolvePath } from '../helpers/deployed-smoke'
import {
  applyVercelProtectionBypassToPage,
  newVercelBypassedRequestContext,
} from './vercel-bypass'

test('exact staging revision supports anonymous, durable, and shared operation chat', async ({ browser }) => {
  test.setTimeout(120_000)

  const baseUrl = requiredBaseUrl()
  const expectedRevision = requiredSourceRevision()
  const ownerStorageState = requiredOwnerStorageState()

  const release = await newVercelBypassedRequestContext(request, baseUrl)
  try {
    const response = await release.get(resolvePath('/api/v1/release', baseUrl))
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({ kind: 'ok', sourceRevision: expectedRevision })
  } finally {
    await release.dispose()
  }

  const anonymousContext = await browser.newContext({
    baseURL: baseUrl.toString(),
    viewport: { width: 320, height: 800 },
  })
  const anonymousPage = await anonymousContext.newPage()
  await applyVercelProtectionBypassToPage(anonymousPage, baseUrl)
  await anonymousPage.goto('/t/new')

  const operationChat = anonymousPage.getByRole('region', { name: 'Operation chat' })
  await expect(operationChat).toBeVisible()
  await expect(operationChat.getByRole('button', { name: 'Sign in' })).toBeVisible()

  const anonymousMessage = operationChat.getByRole('textbox', { name: 'Message' })
  await focusByTab(anonymousPage, anonymousMessage)
  await anonymousMessage.fill('Name one kind of operation this market can search for.')
  await anonymousPage.keyboard.press('Enter')

  const anonymousTranscript = operationChat.getByRole('log', { name: 'Chat transcript' })
  await expect(anonymousTranscript).toHaveAttribute('aria-live', 'polite')
  await expect(anonymousTranscript).toHaveAttribute('aria-relevant', 'additions text')
  const anonymousAssistant = anonymousTranscript.getByRole('article', { name: 'Assistant' }).last()
  await expectAssistantResponse(anonymousAssistant)
  expect(await anonymousPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await anonymousContext.close()

  const ownerContext = await browser.newContext({
    baseURL: baseUrl.toString(),
    storageState: ownerStorageState,
    viewport: { width: 1280, height: 900 },
  })
  const ownerPage = await ownerContext.newPage()
  await applyVercelProtectionBypassToPage(ownerPage, baseUrl)
  await ownerPage.goto('/t/new')

  const ownerChat = ownerPage.getByRole('region', { name: 'Operation chat' })
  await expect(ownerChat.getByText('Saved to your account', { exact: true })).toBeVisible()
  await expect(ownerChat.getByRole('complementary', { name: 'Conversation history' })).toBeVisible()
  await expect(ownerChat.getByRole('button', { name: 'New chat' }).first()).toBeVisible()

  const ownerPrompt = `Staging chat ${Date.now()}: reply with ready.`
  const ownerMessage = ownerChat.getByRole('textbox', { name: 'Message' })
  await focusByTab(ownerPage, ownerMessage)
  await ownerMessage.fill(ownerPrompt)
  await ownerPage.keyboard.press('Enter')
  await expect(ownerPage).toHaveURL(/\/t\/[^/?#]+$/u)

  const ownerTranscript = ownerChat.getByRole('log', { name: 'Chat transcript' })
  await expect(ownerTranscript.getByText(ownerPrompt, { exact: true })).toBeVisible()
  const ownerAssistant = ownerTranscript.getByRole('article', { name: 'Assistant' }).last()
  await expectAssistantResponse(ownerAssistant)

  await ownerChat.getByRole('button', { name: 'Create share link' }).click()
  const shareInput = ownerChat.getByRole('textbox', { name: 'Read-only share link' })
  await expect(shareInput).toHaveAttribute('readonly', '')
  await expect(shareInput).toHaveValue(/^\/s\/[a-f0-9]{64}$/u)
  const sharePath = await shareInput.inputValue()

  const publicContext = await browser.newContext({
    baseURL: baseUrl.toString(),
    viewport: { width: 320, height: 800 },
  })
  const publicPage = await publicContext.newPage()
  await applyVercelProtectionBypassToPage(publicPage, baseUrl)
  await publicPage.goto(sharePath)

  const sharedChat = publicPage.getByRole('region', { name: 'Shared operation chat' })
  await expect(sharedChat).toBeVisible()
  await expect(sharedChat.getByText(ownerPrompt, { exact: true })).toBeVisible()
  await expectAssistantResponse(sharedChat.getByRole('article', { name: 'Assistant' }).last())
  await expect(sharedChat.getByRole('textbox')).toHaveCount(0)
  await expect(sharedChat.getByRole('button', { name: /send message|new chat/i })).toHaveCount(0)
  await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/u)
  expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  await ownerChat.getByRole('button', { name: 'Revoke share link' }).click()
  await expect(ownerChat.getByText('Share link revoked.', { exact: true })).toBeAttached()
  await publicPage.reload()
  await expect(publicPage.getByRole('heading', { name: 'Shared chat unavailable' })).toBeVisible()
  await publicContext.close()

  await ownerChat.getByRole('button', { name: `Delete ${ownerPrompt}` }).click()
  const confirmation = ownerChat.getByText(`Delete “${ownerPrompt}”?`, { exact: true }).locator('..')
  await confirmation.getByRole('button', { name: 'Delete' }).click()
  await expect(ownerPage).toHaveURL(/\/t\/new$/u)
  await ownerContext.close()
})

async function focusByTab(page: Page, target: Locator): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  await expect(target).toBeFocused()
}

async function expectAssistantResponse(article: Locator): Promise<void> {
  await expect.poll(async () => (
    (await article.innerText()).replace(/^Assistant\s*/u, '').trim()
  ), { timeout: 40_000 }).not.toBe('')
}

function requiredBaseUrl(): URL {
  const configured = process.env.PLAYWRIGHT_BASE_URL?.trim()
  if (configured === undefined || configured.length === 0) {
    throw new Error('PLAYWRIGHT_BASE_URL_required')
  }
  const url = parseHttpsUrl('PLAYWRIGHT_BASE_URL', configured, 'chat browser staging smoke')
  if (
    url.username.length > 0
    || url.password.length > 0
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new Error('PLAYWRIGHT_BASE_URL_must_not_contain_credentials_or_query')
  }
  return url
}

function requiredSourceRevision(): string {
  const revision = process.env.AE_RELEASE_SOURCE_REVISION?.trim()
  if (revision === undefined || !/^[a-f0-9]{40}$/u.test(revision)) {
    throw new Error('AE_RELEASE_SOURCE_REVISION_exact_sha_required')
  }
  return revision
}

function requiredOwnerStorageState(): string {
  const storageState = process.env.SMOKE_OWNER_STORAGE_STATE?.trim()
  if (storageState === undefined || storageState.length === 0) {
    throw new Error('SMOKE_OWNER_STORAGE_STATE_required')
  }
  if (!existsSync(storageState)) throw new Error('SMOKE_OWNER_STORAGE_STATE_not_found')
  return storageState
}
