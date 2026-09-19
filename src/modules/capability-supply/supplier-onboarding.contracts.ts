export type SupplierOnboardingStep = 'profile' | 'payouts' | 'first_tool'

export type SupplierOnboardingProfile = Readonly<{
  name: string
  website: string
  abn: string
}>

export type SupplierOnboardingSaveResult =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'error'; message: string }>
