import type { Infer } from 'convex/values'

import type { QueryCtx } from '../../../_generated/server'
import { env } from '../../../_generated/server'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../../../../src/modules/agent-access/service-auth-envelope'

import {
  FUNDING_REFUND_LOOKUP_OPERATION,
  FUNDING_WEBHOOK_LOOKUP_OPERATION,
  FUNDING_WEBHOOK_LOOKUP_SCOPE,
  fundingCommandView,
  fundingResultValue,
  readWebhookFundingArgsValue,
  readWebhookRefundFundingArgsValue,
  refused,
  type FundingResult,
} from './contracts'

export const readWebhookCommandArgs = readWebhookFundingArgsValue
export const readWebhookCommandResult = fundingResultValue
export const readWebhookRefundCommandArgs = readWebhookRefundFundingArgsValue
export const readWebhookRefundCommandResult = fundingResultValue

async function fundingWebhookLookupAuthorized(
  serviceAuth: CustomerRequestServiceAssertion,
  commandRef: string,
  externalRef: string,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined
    || key.length < 32
    || !serviceAuth.scopes.includes(FUNDING_WEBHOOK_LOOKUP_SCOPE)) return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation: FUNDING_WEBHOOK_LOOKUP_OPERATION,
    command: { commandRef, externalRef },
    assertion: serviceAuth,
  })
}

async function refundWebhookLookupAuthorized(
  serviceAuth: CustomerRequestServiceAssertion,
  paymentId: string,
  refundId: string,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined
    || key.length < 32
    || !serviceAuth.scopes.includes(FUNDING_WEBHOOK_LOOKUP_SCOPE)) return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation: FUNDING_REFUND_LOOKUP_OPERATION,
    command: { paymentId, refundId },
    assertion: serviceAuth,
  })
}

export async function readWebhookCommandHandler(
  ctx: QueryCtx,
  args: Infer<typeof readWebhookFundingArgsValue>,
): Promise<FundingResult> {
  if (!await fundingWebhookLookupAuthorized(
    args.serviceAuth,
    args.commandRef,
    args.externalRef,
  )) return refused('billing_identity_missing')
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  return command === null
    || (command.externalRef !== undefined && command.externalRef !== args.externalRef)
    ? refused('funding_pending', true)
    : { kind: 'accepted', command: fundingCommandView(command) }
}

export async function readWebhookRefundCommandHandler(
  ctx: QueryCtx,
  args: Infer<typeof readWebhookRefundFundingArgsValue>,
): Promise<FundingResult> {
  if (!await refundWebhookLookupAuthorized(args.serviceAuth, args.paymentId, args.refundId)) {
    return refused('billing_identity_missing')
  }
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_paymentId', (builder) => builder.eq('paymentId', args.paymentId))
    .unique()
  return command === null || command.paymentId !== args.paymentId
    ? refused('funding_pending', true)
    : { kind: 'accepted', command: fundingCommandView(command) }
}
