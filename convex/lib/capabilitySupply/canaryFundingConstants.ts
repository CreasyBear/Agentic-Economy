// Shared seller-onboarding-canary spend-cap constants.
//
// Extracted from ../../capabilitySupplyCanaryFunding.ts so that
// ../../capabilitySupplyCanaryFundingPreflight.ts can depend on the per-call
// cap without importing capabilitySupplyCanaryFunding.ts directly - that
// import used to close a two-file cycle:
//   capabilitySupplyCanaryFunding -> capabilitySupplyCanaryFundingPreflight
//   -> capabilitySupplyCanaryFunding
//
// CDP's maintained x402 spend-control example uses `environment: development`
// (Base Sepolia), 10,000 atomic units per payment, and 50,000 cumulative:
// github.com/coinbase/cdp-sdk/blob/7ef6ce6cec532dff55eca479a31bbbefac4740b7/
// examples/typescript/x402/clients/payForApiWithSpendControls.ts
// The first AE lane intentionally makes the ledger's monthly ceiling equal to
// that cumulative ceiling as well.
export const SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC = '10000' as const
export const SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC = '50000' as const
export const SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC = '50000' as const
