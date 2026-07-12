export type ProviderQuoteResult =
  | { kind: 'quoted'; expectedCost: { currency: string; amountMinor: number }; maximumCost: { currency: string; amountMinor: number }; expectedLatencyMs: number; dataFields: string[]; disclosures: string[]; providerQuoteRef: string; providerQuoteExpiresAt: number }
  | { kind: 'refused'; reason: string }
export type ProviderExecutionResult =
  | { kind: 'effect_committed'; providerReference: string; outcome: Record<string, string>; reportedCost: { currency: string; amountMinor: number } }
  | { kind: 'effect_not_committed'; reason: string; providerReference?: string }
  | { kind: 'outcome_unknown'; providerReference?: string }
  | { kind: 'reconciliation_pending' }

export type ProviderGateway = {
  quote(input?: { query?: string }): Promise<ProviderQuoteResult>
  execute(input: ProviderOperationInput): Promise<ProviderExecutionResult>
  reconcile(input: ProviderOperationInput): Promise<ProviderExecutionResult>
}

export type ProviderOperationInput = {
  providerQuoteRef?: string
  idempotencyKey?: string
  rootRunId?: string
  leafRunId?: string
  stepGrantId?: string
}

export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>
