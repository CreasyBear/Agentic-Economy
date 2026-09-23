import type { ToolQuoteRefusalCode } from '@/modules/capability-execution/quote'
import {
  refuse as buildQuoteRefusal,
  type QuoteRefusalResult,
} from './quoteValuation'
import type { QuoteArgs, QuoteResult } from './validators'

export const refuse = (
  args: Pick<QuoteArgs, 'toolRef' | 'input' | 'correlationId'>,
  code: ToolQuoteRefusalCode,
  retryable: boolean,
  options: Readonly<{
    reason?: string
    capabilityId?: string
    funding?: Readonly<{
      principalAmount: { currency: 'AUD'; units: string; exponent: 6 }
      idempotencyKey: string
    }>
  }> = {},
): QuoteResult => buildQuoteRefusal(args, code, retryable, options) as QuoteResult

export const quoteRefusal = (refusal: QuoteRefusalResult): QuoteResult => refusal as QuoteResult
