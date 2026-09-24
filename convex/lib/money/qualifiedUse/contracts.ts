
export const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u

export type CanonicalPayoutAuthority = Readonly<{
  owningAccountRef: string
  authorityPrincipalRef: string
  authorityGrantRef: string
  authorityGrantGeneration: number
}>
export type CanonicalQualifiedUseAuthority = CanonicalPayoutAuthority &
  Readonly<{ authorityResourceRef: string }>
export function qualifiedUseAuthorityFailure(): never {
  throw new Error('qualified_use_authority_invalid')
}
