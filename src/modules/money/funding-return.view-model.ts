export type PublicFunding = Readonly<{
  state: 'awaiting_payment' | 'processing' | 'ready' | 'expired' | 'failed'
  agentName: string
  creditAmount: Readonly<{
    currency: 'AUD'
    units: string
    exponent: 6
  }>
}>

export type FundingReadResult =
  | Readonly<{ kind: 'found'; funding: PublicFunding }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'unavailable' }>

export type FundingPageEvent =
  | Readonly<{ type: 'check_started' }>
  | Readonly<{ type: 'check_found'; funding: PublicFunding }>
  | Readonly<{ type: 'check_not_found' }>
  | Readonly<{ type: 'check_unavailable' }>

export type FundingReturnViewState =
  | Readonly<{ kind: 'checking' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{
      kind: 'found'
      funding: PublicFunding
      refresh: 'idle' | 'checking' | 'failed'
    }>
