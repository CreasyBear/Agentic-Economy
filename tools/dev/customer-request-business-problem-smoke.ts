import { pathToFileURL } from 'node:url'

import { chromium } from '@playwright/test'
import { loadEnv } from 'vite'
import { z } from 'zod'

import {
  withTemporaryClerkApiKey,
  withTemporaryClerkUserSession,
} from '../release/customer-request-production-credential'

const evidenceSchema = z.looseObject({
  kind: z.literal('evidence'),
  steps: z.array(z.looseObject({
    evidence: z.array(z.looseObject({ receiptRef: z.string().min(1) })),
  })),
})
const reportSchema = z.looseObject({
  kind: z.literal('problem_reported'),
  reportRef: z.string().min(1),
  problem: z.looseObject({
    category: z.enum([
      'incorrect_result',
      'unexpected_cost',
      'duplicate_charge_or_effect',
      'privacy_concern',
      'could_not_stop',
      'other',
    ]),
    visibility: z.literal('share_with_affected_business'),
  }),
})
const problemCategorySchema = reportSchema.shape.problem.shape.category

async function run(): Promise<void> {
  const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
  const baseUrl = required(env.AE_CUSTOMER_REQUEST_BASE_URL, 'AE_CUSTOMER_REQUEST_BASE_URL')
    .replace(/\/+$/u, '')
  const requestRef = required(
    env.AE_CUSTOMER_REQUEST_EXISTING_REF,
    'AE_CUSTOMER_REQUEST_EXISTING_REF',
  )
  const customerSubject = required(
    env.AE_CUSTOMER_REQUEST_CLERK_SUBJECT,
    'AE_CUSTOMER_REQUEST_CLERK_SUBJECT',
  )
  const problemCategory = problemCategorySchema.parse(
    env.AE_CUSTOMER_REQUEST_PROBLEM_CATEGORY ?? 'incorrect_result',
  )
  const problemSummary = env.AE_CUSTOMER_REQUEST_PROBLEM_SUMMARY?.trim()
    || 'The first recorded result did not satisfy the confirmed customer constraint.'
  const clerk = {
    clerkSecretKey: required(env.CLERK_SECRET_KEY, 'CLERK_SECRET_KEY'),
    expectedInstanceId: required(
      env.AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID,
      'AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID',
    ),
    fetch: globalThis.fetch,
  }
  let reportRef: string | undefined
  let receiptRef: string | undefined
  let customerChecks: Readonly<{
    exactReplay: boolean
    changedReplayRejected: boolean
    evidenceReadback: boolean
  }> | undefined

  await withTemporaryClerkApiKey({
    ...clerk,
    subject: customerSubject,
    run: async (apiKey) => {
      const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      const evidenceResponse = await fetch(
        `${baseUrl}/api/v1/requests/${encodeURIComponent(requestRef)}/evidence`,
        { headers },
      )
      if (!evidenceResponse.ok) throw new Error(`business_problem_evidence_failed:${evidenceResponse.status}`)
      const evidence = evidenceSchema.parse(await evidenceResponse.json())
      receiptRef = evidence.steps[0]?.evidence[0]?.receiptRef
      if (receiptRef === undefined) throw new Error('business_problem_evidence_missing')
      const reportResponse = await fetch(
        `${baseUrl}/api/v1/requests/${encodeURIComponent(requestRef)}/problems`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            idempotencyKey: `dev-business-problem:${problemCategory}:${requestRef}`,
            category: problemCategory,
            summary: problemSummary,
            affectedStep: 1,
            evidenceReceiptRefs: [receiptRef],
            visibility: 'share_with_affected_business',
          }),
        },
      )
      if (!reportResponse.ok) throw new Error(`business_problem_report_failed:${reportResponse.status}`)
      const report = reportSchema.parse(await reportResponse.json())
      if (report.problem.category !== problemCategory) {
        throw new Error('business_problem_category_mismatch')
      }
      reportRef = report.reportRef
      const replayResponse = await fetch(
        `${baseUrl}/api/v1/requests/${encodeURIComponent(requestRef)}/problems`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            idempotencyKey: `dev-business-problem:${problemCategory}:${requestRef}`,
            category: problemCategory,
            summary: problemSummary,
            affectedStep: 1,
            evidenceReceiptRefs: [receiptRef],
            visibility: 'share_with_affected_business',
          }),
        },
      )
      const replay = reportSchema.parse(await replayResponse.json())
      const changedReplayResponse = await fetch(
        `${baseUrl}/api/v1/requests/${encodeURIComponent(requestRef)}/problems`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            idempotencyKey: `dev-business-problem:${problemCategory}:${requestRef}`,
            category: problemCategory,
            summary: `${problemSummary} Changed replay.`,
            affectedStep: 1,
            evidenceReceiptRefs: [receiptRef],
            visibility: 'share_with_affected_business',
          }),
        },
      )
      const readbackResponse = await fetch(
        `${baseUrl}/api/v1/requests/${encodeURIComponent(requestRef)}/evidence`,
        { headers },
      )
      const readback = z.looseObject({
        kind: z.literal('evidence'),
        problems: z.array(z.looseObject({
          reportRef: z.string(),
          category: problemCategorySchema,
          claimSource: z.literal('customer'),
          causality: z.literal('unknown'),
          resolution: z.literal('not_adjudicated'),
        })),
      }).parse(await readbackResponse.json())
      customerChecks = {
        exactReplay: replayResponse.ok && JSON.stringify(replay) === JSON.stringify(report),
        changedReplayRejected: changedReplayResponse.status === 409,
        evidenceReadback: readbackResponse.ok && readback.problems.some((problem) => (
          problem.reportRef === reportRef && problem.category === problemCategory
        )),
      }
    },
  })
  if (reportRef === undefined || receiptRef === undefined || customerChecks === undefined
    || Object.values(customerChecks).some((value) => !value)) {
    throw new Error('business_problem_customer_step_incomplete')
  }
  if (env.AE_CUSTOMER_REQUEST_PROBLEM_CUSTOMER_ONLY === 'true') {
    process.stdout.write(`${JSON.stringify({
      kind: 'development_customer_problem_round_trip',
      requestRef,
      reportRef,
      receiptRef,
      category: problemCategory,
      customerChecks,
      causality: 'unknown',
      resolution: 'not_adjudicated',
      claimBoundary:
        'customer_report_not_proof_the_claimed_failure_occurred;labelled_sandbox_development_only',
    })}\n`)
    return
  }
  const customerEmail = required(
    env.AE_CUSTOMER_REQUEST_CLERK_EMAIL,
    'AE_CUSTOMER_REQUEST_CLERK_EMAIL',
  )
  const ownerSubject = required(
    env.AE_CUSTOMER_REQUEST_BUSINESS_CLERK_SUBJECT,
    'AE_CUSTOMER_REQUEST_BUSINESS_CLERK_SUBJECT',
  )
  const ownerEmail = required(
    env.AE_CUSTOMER_REQUEST_BUSINESS_CLERK_EMAIL,
    'AE_CUSTOMER_REQUEST_BUSINESS_CLERK_EMAIL',
  )
  const supportSubject = required(
    env.AE_CUSTOMER_REQUEST_SUPPORT_CLERK_SUBJECT,
    'AE_CUSTOMER_REQUEST_SUPPORT_CLERK_SUBJECT',
  )
  const supportEmail = required(
    env.AE_CUSTOMER_REQUEST_SUPPORT_CLERK_EMAIL,
    'AE_CUSTOMER_REQUEST_SUPPORT_CLERK_EMAIL',
  )

  let ownerObservation: Readonly<{
    customerStatementVisible: boolean
    evidenceVisible: boolean
    boundaryVisible: boolean
    statementVisibleAfterReload: boolean
  }> | undefined
  await withTemporaryClerkUserSession({
    ...clerk,
    subject: ownerSubject,
    expectedPrimaryEmail: ownerEmail,
    run: async (sessionToken) => {
      const browser = await chromium.launch({ headless: true })
      try {
        const context = await browser.newContext({
          extraHTTPHeaders: { Authorization: `Bearer ${sessionToken}` },
        })
        const page = await context.newPage()
        await page.goto(
          `${baseUrl}/owner/request-problems/${encodeURIComponent(reportRef!)}`,
          { waitUntil: 'networkidle' },
        )
        const customerStatementVisible = await page.getByText(
          problemSummary,
          { exact: true },
        ).first().isVisible()
        const evidenceVisible = await page.getByText('Result evidence 1', { exact: true }).first().isVisible()
        const boundaryVisible = await page.getByText(
          'AE has not decided what caused the problem, who is responsible, or what remedy applies.',
          { exact: true },
        ).first().isVisible()
        await page.getByLabel('Statement').fill(
          'Our recorded output is authentic, but it does not establish which step caused the mismatch.',
        )
        await page.getByLabel('Result evidence 1').check()
        await page.getByRole('button', { name: 'Record business statement' }).click()
        await page.reload({ waitUntil: 'networkidle' })
        const statementVisibleAfterReload = await page.getByText(
          'Our recorded output is authentic, but it does not establish which step caused the mismatch.',
          { exact: true },
        ).first().isVisible()
        ownerObservation = {
          customerStatementVisible,
          evidenceVisible,
          boundaryVisible,
          statementVisibleAfterReload,
        }
      } finally {
        await browser.close()
      }
    },
  })
  if (ownerObservation === undefined || Object.values(ownerObservation).some((value) => !value)) {
    throw new Error(`business_problem_owner_journey_incomplete:${JSON.stringify(ownerObservation)}`)
  }
  let supportObservation: Readonly<{
    exportVisible: boolean
    waitingForCustomerVisible: boolean
    customerReplyAccepted: boolean
    replyVisibleAfterReload: boolean
  }> | undefined
  let supportDebug = ''
  await withTemporaryClerkUserSession({
    ...clerk,
    subject: supportSubject,
    expectedPrimaryEmail: supportEmail,
    run: async (sessionToken) => {
      const browser = await chromium.launch({ headless: true })
      try {
        const context = await browser.newContext({
          extraHTTPHeaders: { Authorization: `Bearer ${sessionToken}` },
        })
        const page = await context.newPage()
        await page.goto(`${baseUrl}/admin/request-problems`, { waitUntil: 'networkidle' })
        const statusSelect = page.locator(`select[id="problem-state-${reportRef}"]`)
        const card = statusSelect.locator(
          'xpath=ancestor::div[.//button[contains(., "Record status update")]][1]',
        )
        await card.getByRole('button', { name: 'Inspect report record' }).click()
        const exportVisible = await card.getByText('Customer report record', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
          .then(() => true, () => false)
        await statusSelect.selectOption('waiting_for_customer')
        await page.locator(`textarea[id="problem-message-${reportRef}"]`).fill(
          'Please identify the exact confirmed constraint that the result did not meet.',
        )
        await card.getByRole('button', { name: 'Record status update' }).click()
        await page.waitForTimeout(1_500)
        await page.reload({ waitUntil: 'networkidle' })
        const refreshedStatusSelect = page.locator(`select[id="problem-state-${reportRef}"]`)
        const refreshedCard = refreshedStatusSelect.locator(
          'xpath=ancestor::div[.//button[contains(., "Record status update")]][1]',
        )
        const refreshedCardText = await refreshedCard.innerText()
        const waitingForCustomerVisible = /waiting for customer/iu.test(refreshedCardText)
        const versionMatch = /Version (\d+)/u.exec(refreshedCardText)
        const expectedVersion = Number(versionMatch?.[1])
        if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
          throw new Error(`business_problem_support_version_missing:${refreshedCardText.slice(0, 500)}`)
        }

        let customerReplyAccepted = false
        let customerReplyDebug = ''
        await withTemporaryClerkUserSession({
          ...clerk,
          subject: customerSubject,
          expectedPrimaryEmail: customerEmail,
          run: async (customerSessionToken) => {
            const response = await fetch(
              `${baseUrl}/api/requests/${encodeURIComponent(requestRef)}/problems/${encodeURIComponent(reportRef!)}/replies`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${customerSessionToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  expectedVersion,
                  idempotencyKey: `dev-business-problem-reply:${requestRef}:${expectedVersion}`,
                  message: 'The result exceeded the confirmed maximum cost.',
                }),
              },
            )
            const body: unknown = await response.json()
            customerReplyDebug = `${response.status}:${JSON.stringify(body)}`
            customerReplyAccepted = response.ok
              && typeof body === 'object' && body !== null
              && 'kind' in body && body.kind === 'problem_reply_recorded'
          },
        })
        await page.reload({ waitUntil: 'networkidle' })
        const finalStatusSelect = page.locator(`select[id="problem-state-${reportRef}"]`)
        const finalCard = finalStatusSelect.locator(
          'xpath=ancestor::div[.//button[contains(., "Record status update")]][1]',
        )
        await finalCard.getByRole('button', { name: 'Inspect report record' }).click()
        await finalCard.getByText('Customer report record', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        supportDebug = (await finalCard.innerText()).slice(0, 2_000)
        const replyVisibleAfterReload = supportDebug.includes(
          'Customer · investigating · The result exceeded the confirmed maximum cost.',
        )
        supportObservation = {
          exportVisible,
          waitingForCustomerVisible,
          customerReplyAccepted,
          replyVisibleAfterReload,
        }
        if (!customerReplyAccepted) {
          throw new Error(`business_problem_customer_reply_failed:${customerReplyDebug}`)
        }
      } finally {
        await browser.close()
      }
    },
  })
  if (supportObservation === undefined || Object.values(supportObservation).some((value) => !value)) {
    throw new Error(
      `business_problem_support_journey_incomplete:${JSON.stringify(supportObservation)}:${supportDebug}`,
    )
  }
  process.stdout.write(`${JSON.stringify({
    kind: 'development_business_problem_round_trip',
    requestRef,
    reportRef,
    receiptRef,
    category: problemCategory,
    customerChecks,
    ownerObservation,
    supportObservation,
    claimBoundary:
      'labelled_sandbox_development_not_independently_operated_supply_fulfilment_or_customer_value',
  })}\n`)
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  await run().catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}
