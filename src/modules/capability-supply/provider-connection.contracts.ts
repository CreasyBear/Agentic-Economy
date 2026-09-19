export type ProviderConnectionInspection = Readonly<{
  digest: string
  payTo: string
  amount: string
  network: string
  asset: string
  claimMessage: string
  claimExpiresAt: number
}>
