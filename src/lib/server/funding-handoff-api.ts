import { bearerChallenge } from '@/lib/http/oauth-challenge'
import { gatewayFailureToProblem } from '@/lib/errors'
import { authenticateAgentAccess, resolveAgentAccessPrincipal, type AgentAccessAuthenticationOptions, type AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { callPublicSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { response } from '@/lib/server/no-store-response'
import { problem } from '@/lib/server/problem'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { createAccountManagementService } from '@/modules/agent-access/account.actions'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import {
  readFundingConstraints,
  type CreditPaymentPort,
} from '@/modules/money/public'
import {
  createFundingHandoffInputSchema,
  fundingHandoffConfigResultSchema,
  fundingHandoffStatusInputSchema,
  fundingHandoffConfigAction,
  fundingHandoffCreateAction,
  fundingHandoffStatusAction,
  type CreateFundingHandoffResult,
  type FundingHandoffService,
  type FundingHandoffStatusResult,
} from '@/modules/money/funding-handoff.actions'
import { createStripeMoneyProvider, readStripeMoneyProviderConfig } from '@/lib/server/stripe-money-provider'
import {
  fundingEvidence,
  fundingPaymentRequest,
  type AccountFundingCommandView,
  type FundingProviderEvidence,
} from '@/modules/money/server'
import { isMoneyRefusal, type MoneyRefusal } from '@/modules/money/public'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { z } from 'zod'

const MAX_BODY_BYTES = 64 * 1024
const reserveAgentHandoff = sourceMutation<Record<string, unknown>, FundingCommandResult>('moneyAccountFunding:reserveAgentHandoff')
const bindAgentHandoff = sourceMutation<Record<string, unknown>, FundingCommandResult>('moneyAccountFunding:bindAgentHandoff')
const readAgentHandoff = sourceMutation<Record<string, unknown>, FundingCommandResult>('moneyAccountFunding:readAgentHandoff')
const readPayerSafeHandoff = sourceQuery<{ externalRef: string }, PublicHandoffResult>('moneyAccountFunding:readPayerSafeHandoff')

type FundingCommandResult = { kind: 'accepted'; command: AccountFundingCommandView } | MoneyRefusal
type PublicHandoffResult =
  | { kind: 'found'; funding: { state: 'awaiting_payment' | 'processing' | 'ready' | 'expired' | 'failed'; agentName: string; creditAmount: { currency: string; units: string; exponent: number } } }
  | { kind: 'not_found' }

export type FundingHandoffHandlerOptions = Readonly<{
  authenticate?: AgentAccessAuthenticationOptions['authenticate']
  resolvePrincipal?: AgentAccessPrincipalResolver
  service?: FundingHandoffService
}>

export function createFundingHandoffService(
  request: Request,
  bodyText: string,
  providerOverride?: CreditPaymentPort,
): FundingHandoffService {
  const providerContext = () => {
    if (providerOverride !== undefined) return { provider: providerOverride, environment: 'sandbox' as const }
    const config = readStripeMoneyProviderConfig(process.env)
    if (isMoneyRefusal(config)) return config
    return {
      provider: createStripeMoneyProvider({ config }),
      environment: config.mode === 'live' ? 'production' as const : 'sandbox' as const,
    }
  }
  async function mutate(
    reference: Parameters<typeof callPublicSourceMutation>[0],
    command: Record<string, unknown>,
    operationKey: string,
    correlationId: string,
  ): Promise<FundingCommandResult> {
    const sourceWrite = await sourceWriteAdmissionFromRequest({
      request, command, body: bodyText, scope: 'billing', operationKey, correlationId,
    })
    return await callPublicSourceMutation(reference, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    }) as FundingCommandResult
  }
  function refusal(value: MoneyRefusal, correlationRef: string): CreateFundingHandoffResult {
    return { kind: 'refused', code: value.code, retryable: value.retryable, correlationRef }
  }
  async function bind(
    commandRef: string,
    evidence: FundingProviderEvidence,
    principal: AgentAccessPrincipal,
    correlationId: string,
  ) {
    const operationKey = 'moneyAccountFunding:bindAgentHandoff'
    return await mutate(bindAgentHandoff, {
      commandRef, evidence, agentPrincipal: principal, operationKey, correlationId,
    }, operationKey, correlationId)
  }
  return {
    config: async () => {
      const constraints = readFundingConstraints()
      return fundingHandoffConfigResultSchema.parse({
        kind: 'funding_config', success: true, currency: 'AUD',
        minimum: constraints.minimum, maximum: constraints.maximum, increment: constraints.increment,
        checkout: 'stripe_hosted', payerGainsAuthority: false, reusablePaymentAuthority: false,
      })
    },
    create: async ({ input, principal, correlationId }) => {
      const context = providerContext()
      if (isMoneyRefusal(context)) return refusal(context, correlationId)
      const checkoutExpiresAt = (Math.floor(Date.now() / 1000) + 60 * 60) * 1000
      const baseUrl = resolveCanonicalBaseUrl(request).baseUrl
      const operationKey = 'moneyAccountFunding:reserveAgentHandoff'
      const command = {
        principalAmountUnits: input.principalAmount.units,
        environment: context.environment,
        idempotencyKey: input.idempotencyKey,
        successReturnRef: `${baseUrl}/fund/{CHECKOUT_SESSION_ID}`,
        cancelReturnRef: `${baseUrl}/fund/cancelled`,
        checkoutExpiresAt,
        agentPrincipal: principal,
        operationKey,
        correlationId,
      }
      const reserved = await mutate(reserveAgentHandoff, command, operationKey, correlationId)
      if (isMoneyRefusal(reserved)) return refusal(reserved, correlationId)
      const idempotentReplay = reserved.command.externalRef !== undefined
      const payment = await context.provider.createOrRecoverCreditPayment(
        fundingPaymentRequest(reserved.command, reserved.command.externalRef),
      )
      if (isMoneyRefusal(payment)) return refusal(payment, correlationId)
      if (payment.kind !== 'hosted_redirect' || payment.checkoutUrl === undefined) {
        return { kind: 'refused', code: 'funding_outcome_unknown', retryable: true, correlationRef: correlationId }
      }
      const bound = await bind(reserved.command.commandRef, fundingEvidence(payment.evidence), principal, correlationId)
      if (isMoneyRefusal(bound)) return refusal(bound, correlationId)
      const fundingSessionId = payment.evidence.externalRef
      return {
        kind: 'funding_session', success: true, fundingSessionId,
        checkoutUrl: payment.checkoutUrl,
        statusUrl: `${baseUrl}/api/v1/account/funding-sessions/${encodeURIComponent(fundingSessionId)}`,
        expiresAt: payment.expiresAt,
        quote: quote(bound.command),
        humanHandoff: {
          message: `Open this secure Stripe link to add AUD credit for ${bound.command.requesterDisplayName ?? 'the agent'}.`,
          instruction: 'Send checkoutUrl to the payer, persist fundingSessionId, then poll status. The payer does not sign in to AE.',
        },
        pollAfterMs: 5000,
        idempotentReplay,
      }
    },
    status: async ({ input, principal, correlationId }) => {
      const operationKey = 'moneyAccountFunding:readAgentHandoff'
      const found = await mutate(readAgentHandoff, {
        externalRef: input.fundingSessionId, agentPrincipal: principal, operationKey, correlationId,
      }, operationKey, correlationId)
      if (isMoneyRefusal(found)) {
        return found.code === 'funding_pending'
          ? { kind: 'not_found' }
          : { kind: 'error', code: found.code, retryable: found.retryable, correlationRef: correlationId, nextAction: { kind: 'poll' } }
      }
      const command = found.command
      const common = { success: true as const, fundingSessionId: input.fundingSessionId, quote: quote(command) }
      if (command.state === 'succeeded') {
        const balance = await createAccountManagementService(request, bodyText).balance({ input: { currency: 'AUD' }, principal, correlationId })
        if (balance.kind !== 'available') return unavailable(correlationId)
        return { kind: 'ready', ...common, state: 'ready', paymentStatus: 'paid', balance: { usableAmount: balance.balance }, nextAction: { kind: 'continue' } }
      }
      if (command.terminalReason === 'expired') return { kind: 'expired', ...common, state: 'expired', paymentStatus: 'unpaid', nextAction: { kind: 'create_new' } }
      if (command.terminalReason === 'async_payment_failed' || command.state === 'failed') {
        return { kind: 'failed', ...common, state: 'failed', paymentStatus: 'failed', nextAction: { kind: 'create_new' } }
      }
      const context = providerContext()
      if (isMoneyRefusal(context)) return unavailable(correlationId, context.code)
      const payment = await context.provider.readCreditPayment({
        ...fundingPaymentRequest(command), externalRef: input.fundingSessionId,
      })
      if (isMoneyRefusal(payment)) return unavailable(correlationId, payment.code)
      const bound = await bind(command.commandRef, fundingEvidence(payment.evidence), principal, correlationId)
      if (isMoneyRefusal(bound)) return unavailable(correlationId, bound.code)
      if (payment.evidence.checkoutStatus === 'expired') {
        return { kind: 'expired', ...common, state: 'expired', paymentStatus: 'unpaid', nextAction: { kind: 'create_new' } }
      }
      if (payment.evidence.checkoutStatus === 'complete') {
        return {
          kind: 'processing', ...common, state: 'processing',
          paymentStatus: payment.evidence.paymentStatus === 'paid' ? 'paid' : 'unpaid',
          nextAction: { kind: 'poll' }, pollAfterMs: 5000,
        }
      }
      if (payment.kind !== 'hosted_redirect' || payment.checkoutUrl === undefined) return unavailable(correlationId)
      return {
        kind: 'awaiting_payment', ...common, state: 'awaiting_payment', paymentStatus: 'unpaid',
        nextAction: { kind: 'share_checkout', checkoutUrl: payment.checkoutUrl }, pollAfterMs: 5000,
      }
    },
  }
}

function quote(command: AccountFundingCommandView) {
  const amount = (units: string) => ({ currency: 'AUD' as const, exponent: 6 as const, units })
  return {
    principalAmount: amount(command.principalUnits), serviceFeeAmount: amount(command.serviceFeeUnits),
    taxAmount: amount(command.taxUnits), totalPaymentAmount: amount(command.totalUnits),
  }
}

function unavailable(correlationRef: string, code = 'source_unavailable'): FundingHandoffStatusResult {
  return { kind: 'error', code, retryable: true, correlationRef, nextAction: { kind: 'poll' } }
}

export async function handleFundingHandoffAction(
  request: Request,
  actionName: 'config' | 'create' | 'status',
  pathSessionId?: string,
  options: FundingHandoffHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const body = actionName === 'config' ? { ok: true as const, text: '{}' } : await readBoundedRequestText(request, MAX_BODY_BYTES)
    if (!body.ok) return withRequestCorrelationHeader(problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: body.code }), correlationId)
    const resolvePrincipal = options.resolvePrincipal ?? (options.authenticate === undefined ? resolveAgentAccessPrincipal(request, body.text, correlationId) : undefined)
    const admitted = await authenticateAgentAccess({
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
      requiredScope: MARKET_OPERATIONS_INVOKE_SCOPE,
      consequenceResource: `surface:http:funding-handoff-${actionName}`,
    })
    if (admitted.kind !== 'authenticated') {
      const failure = gatewayFailureToProblem({ kind: 'refused', code: admitted.reason, retryable: false })
      return withRequestCorrelationHeader(problem({ ...failure, status: admitted.status, detail: 'Connect a buyer agent before creating or reading a funding handoff.' }, {
        Vary: 'Authorization', 'WWW-Authenticate': bearerChallenge(resolveCanonicalBaseUrl(request).baseUrl, MARKET_OPERATIONS_INVOKE_SCOPE),
      }), correlationId)
    }
    let raw: unknown = {}
    if (actionName !== 'config') {
      try {
        if (actionName === 'status') raw = { fundingSessionId: pathSessionId }
        else {
          const httpBody = z.strictObject({ principalAmount: createFundingHandoffInputSchema.shape.principalAmount })
            .parse(JSON.parse(body.text) as unknown)
          raw = { ...httpBody, idempotencyKey: request.headers.get('Idempotency-Key') ?? '' }
        }
      }
      catch { return withRequestCorrelationHeader(problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request', detail: 'Provide one exact AUD principalAmount and an Idempotency-Key header.' }), correlationId) }
    }
    const parsed = actionName === 'config'
      ? fundingHandoffConfigInputSchemaSafe(raw)
      : actionName === 'create' ? createFundingHandoffInputSchema.safeParse(raw) : fundingHandoffStatusInputSchema.safeParse(raw)
    if (!parsed.success) {
      return actionName === 'status'
        ? withRequestCorrelationHeader(problem({ status: 404, kind: 'NOT_FOUND', code: 'funding_session_not_found' }), correlationId)
        : withRequestCorrelationHeader(problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request' }), correlationId)
    }
    const service = options.service ?? createFundingHandoffService(request, body.text)
    const context = { caller: 'http' as const, request, correlationId, agentAccessPrincipal: admitted.principal, fundingHandoffService: service }
    let result
    try {
      result = actionName === 'config'
        ? await fundingHandoffConfigAction.run({ data: {}, context })
        : actionName === 'create'
          ? await fundingHandoffCreateAction.run({ data: createFundingHandoffInputSchema.parse(raw), context })
          : await fundingHandoffStatusAction.run({ data: fundingHandoffStatusInputSchema.parse(raw), context })
    } catch {
      return withRequestCorrelationHeader(problem({
        status: 503, kind: 'UNAVAILABLE', code: 'funding_source_unavailable', retryable: true,
        detail: 'Funding status is temporarily unavailable. Retry the same request or poll the same funding session.',
        extras: {
          correlationRef: correlationId,
          nextAction: actionName === 'status'
            ? { kind: 'poll' }
            : actionName === 'create'
              ? { kind: 'retry_same_request' }
              : { kind: 'retry' },
        },
      }), correlationId)
    }
    if (result.kind === 'refused' || result.kind === 'error') {
      const status = result.kind === 'refused' && result.code === 'funding_idempotency_conflict'
        ? 409
        : result.kind === 'refused' && result.code === 'funding_amount_invalid'
          ? 400
          : result.kind === 'error' && result.code === 'funding_pending' ? 404 : 503
      return withRequestCorrelationHeader(problem({
        status,
        kind: status === 409 ? 'ALREADY_EXISTS' : status === 404 ? 'NOT_FOUND' : status === 400 ? 'INVALID_ARGUMENT' : 'UNAVAILABLE',
        code: result.code,
        retryable: result.retryable,
        detail: status === 409 ? 'This idempotency key was already used with a different amount.' : status === 400 ? 'The AUD principal amount is outside the current funding limits.' : 'Funding status is temporarily unavailable. Poll the same funding session.',
        extras: {
          correlationRef: result.kind === 'error' ? result.correlationRef : correlationId,
          ...(result.kind === 'error' ? { nextAction: result.nextAction } : {}),
        },
      }), correlationId)
    }
    if (result.kind === 'not_found') return withRequestCorrelationHeader(problem({ status: 404, kind: 'NOT_FOUND', code: 'funding_session_not_found' }), correlationId)
    return withRequestCorrelationHeader(response(result, actionName === 'create' ? 201 : 200, {
      ...(result.kind === 'funding_session' && result.idempotentReplay ? { 'Idempotent-Replay': 'true' } : {}),
    }), correlationId)
  })
}

function fundingHandoffConfigInputSchemaSafe(value: unknown) {
  return fundingHandoffConfigAction.schema.safeParse(value)
}

export async function readPublicFundingHandoff(fundingSessionId: string): Promise<PublicHandoffResult> {
  if (!/^cs_[A-Za-z0-9_]+$/u.test(fundingSessionId)) return { kind: 'not_found' }
  return await callSourceQuery(readPayerSafeHandoff, { externalRef: fundingSessionId })
}

export function publicFundingHandoffResponse(result: PublicHandoffResult): Response {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }
  return result.kind === 'found'
    ? Response.json({ success: true, funding: result.funding }, { headers })
    : problem({ status: 404, kind: 'NOT_FOUND', code: 'funding_session_not_found' }, headers)
}
