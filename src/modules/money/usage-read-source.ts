import { canonicalDigest } from '@/modules/common/canonical-digest'
export function usageReadSourceDigest(source: {environment: 'sandbox' | 'production'; ledger: string; gatewayUrl: string}) {
  return canonicalDigest({format: 'ae.formance-usage-read-source:v1', environment: source.environment, ledger: source.ledger.trim(), gatewayUrl: new URL(source.gatewayUrl.trim()).origin})
}
