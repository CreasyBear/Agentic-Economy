import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { resolveStripeReceiptUrl, type StripeReceiptRefusalCode } from '@/lib/server/stripe-receipt'
import { createStripeMoneyClient } from '@/lib/server/stripe-money-client'
import { readStripeMoneyProviderConfig } from '@/lib/server/stripe-money-provider-config'
import { isMoneyRefusal, type MoneyRefusalCode } from './money-types'

const readOwnerFundingCommandForReceiptQuery = sourceQuery<
  Readonly<{ commandRef: string }>,
  Readonly<{ paymentId: string }>
>('moneyAccountFunding:readOwnerFundingCommandForReceipt')

export type ReadStripeReceiptUrlResult =
  | Readonly<{ kind: 'ok'; receiptUrl: string }>
  | Readonly<{ kind: 'refused'; code: StripeReceiptRefusalCode | MoneyRefusalCode; retryable: boolean }>

const commandRefSchema = z.strictObject({
  commandRef: z.string().min(1),
})

export async function readStripeReceiptUrlThroughSource(
  commandRef: string,
): Promise<ReadStripeReceiptUrlResult> {
  const config = readStripeMoneyProviderConfig()
  if (isMoneyRefusal(config)) {
    return config
  }

  const binding = await callSourceQuery(readOwnerFundingCommandForReceiptQuery, { commandRef })
  const client = createStripeMoneyClient(config.secretKey)
  const resolved = await resolveStripeReceiptUrl({ client, paymentId: binding.paymentId })
  if (resolved.kind === 'ok') {
    return { kind: 'ok', receiptUrl: resolved.receiptUrl }
  }
  return { kind: 'refused', code: resolved.code, retryable: false }
}

export const readStripeReceiptUrlServer = createServerFn({ method: 'POST' })
  .validator((data) => commandRefSchema.parse(data))
  .handler(async ({ data }): Promise<ReadStripeReceiptUrlResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await readStripeReceiptUrlThroughSource(data.commandRef)
  })
