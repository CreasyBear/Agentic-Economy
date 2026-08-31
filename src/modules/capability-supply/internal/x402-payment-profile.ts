export const BASE_MAINNET_NETWORK = 'eip155:8453' as const
export const BASE_SEPOLIA_NETWORK = 'eip155:84532' as const
export const BASE_MAINNET_USDC_ADDRESS =
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
export const BASE_SEPOLIA_USDC_ADDRESS =
  '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const

export type X402AeEnvironment = 'sandbox' | 'production'

export type X402PaymentProfile =
  | Readonly<{
      profile: 'base-sepolia-usdc-exact'
      aeEnvironment: 'sandbox'
      network: typeof BASE_SEPOLIA_NETWORK
      asset: typeof BASE_SEPOLIA_USDC_ADDRESS
      scheme: 'exact'
      transferMethod: 'eip3009'
    }>
  | Readonly<{
      profile: 'base-usdc-exact'
      aeEnvironment: 'production'
      network: typeof BASE_MAINNET_NETWORK
      asset: typeof BASE_MAINNET_USDC_ADDRESS
      scheme: 'exact'
      transferMethod: 'eip3009'
    }>

export type X402PaymentRequirementLike = Readonly<{
  scheme: string
  network: string
  amount: string
  asset: string
  payTo: string
  maxTimeoutSeconds: number
  extra: Readonly<Record<string, unknown>>
}>

const SANDBOX_PAYMENT_PROFILE: X402PaymentProfile = Object.freeze({
  profile: 'base-sepolia-usdc-exact',
  aeEnvironment: 'sandbox',
  network: BASE_SEPOLIA_NETWORK,
  asset: BASE_SEPOLIA_USDC_ADDRESS,
  scheme: 'exact',
  transferMethod: 'eip3009',
})

const PRODUCTION_PAYMENT_PROFILE: X402PaymentProfile = Object.freeze({
  profile: 'base-usdc-exact',
  aeEnvironment: 'production',
  network: BASE_MAINNET_NETWORK,
  asset: BASE_MAINNET_USDC_ADDRESS,
  scheme: 'exact',
  transferMethod: 'eip3009',
})

export function x402PaymentProfileForEnvironment(
  aeEnvironment: unknown,
): X402PaymentProfile | undefined {
  if (aeEnvironment === 'sandbox') return SANDBOX_PAYMENT_PROFILE
  if (aeEnvironment === 'production') return PRODUCTION_PAYMENT_PROFILE
  return undefined
}

/**
 * x402's exact EVM client routes an omitted assetTransferMethod through
 * EIP-3009. Materialize that default before hashing or comparing a lane so an
 * omitted field and an explicit `eip3009` declaration have one identity.
 */
export function normalizeX402PaymentRequirement<
  T extends Readonly<{ extra: Readonly<Record<string, unknown>> }>,
>(requirement: T): T & Readonly<{
  extra: Readonly<Record<string, unknown> & { assetTransferMethod: unknown }>
}> {
  return {
    ...requirement,
    extra: {
      ...requirement.extra,
      assetTransferMethod:
        requirement.extra.assetTransferMethod === undefined
          ? 'eip3009'
          : requirement.extra.assetTransferMethod,
    },
  }
}

export function isX402PaymentRequirementForProfile(
  requirement: X402PaymentRequirementLike,
  profile: X402PaymentProfile,
  maxAtomic?: bigint,
): boolean {
  const normalized = normalizeX402PaymentRequirement(requirement)
  if (
    normalized.scheme !== profile.scheme
    || normalized.network !== profile.network
    || normalized.asset.toLowerCase() !== profile.asset.toLowerCase()
    || normalized.extra.assetTransferMethod !== profile.transferMethod
    || !/^[1-9]\d{0,77}$/.test(normalized.amount)
    || !/^0x[0-9a-fA-F]{40}$/.test(normalized.payTo)
    || !Number.isSafeInteger(normalized.maxTimeoutSeconds)
    || normalized.maxTimeoutSeconds <= 0
    || (maxAtomic !== undefined && maxAtomic <= 0n)
  ) return false
  try {
    return maxAtomic === undefined || BigInt(normalized.amount) <= maxAtomic
  } catch {
    return false
  }
}
