import { canonicalDigest } from '@/modules/common/canonical-digest'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { isBoundedJsonValue, type JsonValue } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import { x402PaymentProfileForEnvironment, type X402AeEnvironment } from './x402-payment-profile'
import type { CdpClientLike, CdpX402PolicyIdentity } from './cdp-x402-payment-contracts'
import type { CdpX402CustodyConfiguration } from './x402-custody-configuration'
import { hasPolicy, sameEvmAddress } from './cdp-x402-payment-validation'

export type CdpX402CustodyReadinessResult =
  | Readonly<{ kind: 'ready'; address: string; policyRulesDigest: string }>
  | Readonly<{ kind: 'refused'; code: 'cdp_custody_configuration_invalid' | 'cdp_custody_environment_unsupported'
      | 'cdp_custody_policy_mismatch' | 'cdp_custody_account_mismatch' | 'cdp_custody_not_found' }>
  | Readonly<{ kind: 'unavailable'; code: 'cdp_custody_read_unavailable' | 'cdp_custody_response_invalid' }>

type CdpCustodyReader = Readonly<{
  policies: Readonly<{ getPolicyById: (options: Readonly<{ id: string }>) => Promise<CdpX402PolicyIdentity | JsonValue> }>
  evm: Readonly<{ getAccount: (options: Readonly<{ name: string }>) => Promise<Awaited<ReturnType<CdpClientLike['evm']['getAccount']>> | JsonValue> }>
}>

/**
 * Requires: parsed custody configuration and a supported payment environment.
 * Ensures: ready only for the exact live account and both approved policy documents.
 * Invariant: only reads; signing and readiness use the same custody predicate.
 * On violation: known drift is refused, malformed responses are unavailable;
 * transport failures propagate to the caller's existing recovery boundary.
 */
export async function readCdpX402CustodyAccount(
  reader: CdpCustodyReader,
  configuration: CdpX402CustodyConfiguration,
  aeEnvironment: X402AeEnvironment,
): Promise<CdpX402CustodyReadinessResult> {
  const [rawAccountPolicy, rawProjectPolicy] = await Promise.all([
    reader.policies.getPolicyById({ id: configuration.accountPolicyId }),
    reader.policies.getPolicyById({ id: configuration.projectPolicyId }),
  ])
  const accountPolicy = readPolicyIdentity(rawAccountPolicy)
  const projectPolicy = readPolicyIdentity(rawProjectPolicy)
  if (accountPolicy === undefined || projectPolicy === undefined) {
    return degradeBackend('cdp_custody_response_invalid',
      { kind: 'unavailable', code: 'cdp_custody_response_invalid' } as const,
      { site: 'readCdpX402CustodyAccount', reason: 'invalid_response' })
  }
  if (accountPolicy.id.toLowerCase() !== configuration.accountPolicyId
    || accountPolicy.scope !== 'account'
    || projectPolicy.id.toLowerCase() !== configuration.projectPolicyId
    || projectPolicy.scope !== 'project'
    || cdpX402PolicyRulesDigest(accountPolicy, projectPolicy) !== configuration.policyRulesDigest) {
    return { kind: 'refused', code: 'cdp_custody_policy_mismatch' }
  }
  const account = await reader.evm.getAccount({ name: configuration.accountName })
  if (!isRecord(account) || typeof account.address !== 'string'
    || (account.policies !== undefined && (!Array.isArray(account.policies)
      || !account.policies.every((id: unknown) => typeof id === 'string')))) {
    return degradeBackend('cdp_custody_response_invalid',
      { kind: 'unavailable', code: 'cdp_custody_response_invalid' } as const,
      { site: 'readCdpX402CustodyAccount', reason: 'invalid_response' })
  }
  if (!hasPolicy(account.policies, configuration.accountPolicyId)
    || !hasPolicy(account.policies, configuration.projectPolicyId)
    || !sameEvmAddress(account.address, configuration.expectedEvmAddress)) {
    return { kind: 'refused', code: 'cdp_custody_account_mismatch' }
  }
  if (!cdpX402ManagedPolicyIsExact(accountPolicy, projectPolicy, account.address,
    configuration.maxAtomic.toString(), aeEnvironment)) {
    return { kind: 'refused', code: 'cdp_custody_policy_mismatch' }
  }
  return { kind: 'ready', address: account.address, policyRulesDigest: configuration.policyRulesDigest }
}

function readPolicyIdentity(value: unknown): CdpX402PolicyIdentity | undefined {
  if (!isRecord(value) || typeof value.id !== 'string'
    || (value.scope !== 'account' && value.scope !== 'project')) return undefined
  const rules = boundedCdpPolicyRules(value.rules)
  return rules === undefined ? undefined : { id: value.id, scope: value.scope, rules }
}

const MAX_CDP_POLICY_RULES = 10
const MAX_CDP_POLICY_RULES_BYTES = 64 * 1024
const utf8Encoder = new TextEncoder()

/**
 * Seals the exact non-secret policy documents that are allowed to govern CDP
 * signing. Descriptions and timestamps are deliberately excluded; policy IDs,
 * scopes, rule order, criteria, conditions, contracts, payees, and caps remain
 * inside the canonical digest.
 */
export function cdpX402PolicyRulesDigest(
  accountPolicy: CdpX402PolicyIdentity,
  projectPolicy: CdpX402PolicyIdentity,
): string | undefined {
  const accountRules = boundedCdpPolicyRules(accountPolicy.rules)
  const projectRules = boundedCdpPolicyRules(projectPolicy.rules)
  if (accountRules === undefined || projectRules === undefined) return undefined
  const material = {
    kind: 'ae.x402.cdp-policy-rules:v1',
    accountPolicy: {
      id: accountPolicy.id.toLowerCase(),
      scope: accountPolicy.scope,
      rules: accountRules,
    },
    projectPolicy: {
      id: projectPolicy.id.toLowerCase(),
      scope: projectPolicy.scope,
      rules: projectRules,
    },
  } as const
  const encoded = stableStringify(material)
  if (utf8Encoder.encode(encoded).byteLength > MAX_CDP_POLICY_RULES_BYTES) {
    return undefined
  }
  return canonicalDigest(material)
}

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  primaryType: 'TransferWithAuthorization',
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  },
} as const

/**
 * CDP's policy engine is fail-secure: a request is rejected when no accept
 * rule matches. Managed x402 signing therefore uses a payee-agnostic wallet rule
 * and keeps the dynamic seller address inside AE's canonical Operation,
 * request fingerprint, reservation, and per-call/daily budget fences.
 */
export function cdpX402ManagedPolicyRules(
  payerAddress: string,
  maximumAtomic: string,
  aeEnvironment: X402AeEnvironment = 'sandbox',
): Readonly<{ accountRules: readonly unknown[]; projectRules: readonly unknown[] }> {
  const profile = x402PaymentProfileForEnvironment(aeEnvironment)
  if (profile === undefined) throw new Error('x402_managed_payment_profile_invalid')
  return {
    accountRules: [{
      action: 'accept',
      operation: 'signEvmTypedData',
      criteria: [{
        type: 'evmTypedDataVerifyingContract',
        addresses: [profile.asset],
        operator: 'in',
      }, {
        type: 'evmTypedDataField',
        conditions: [{
          path: 'from',
          operator: 'in',
          addresses: [payerAddress],
        }, {
          path: 'value',
          operator: '<=',
          value: maximumAtomic,
        }],
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      }],
    }],
    projectRules: [{
      action: 'reject',
      operation: 'signEvmTypedData',
      criteria: [{
        type: 'evmTypedDataVerifyingContract',
        addresses: [profile.asset],
        operator: 'not in',
      }],
    }, {
      action: 'reject',
      operation: 'signEvmTypedData',
      criteria: [{
        type: 'evmTypedDataField',
        conditions: [{
          path: 'value',
          operator: '>',
          value: maximumAtomic,
        }],
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      }],
    }],
  }
}

export function cdpX402ManagedPolicyIsExact(
  accountPolicy: CdpX402PolicyIdentity,
  projectPolicy: CdpX402PolicyIdentity,
  payerAddress: string,
  maximumAtomic: string,
  aeEnvironment: X402AeEnvironment = 'sandbox',
): boolean {
  const expected = cdpX402ManagedPolicyRules(payerAddress, maximumAtomic, aeEnvironment)
  return canonicalDigest(accountPolicy.rules as StableHashValue)
      === canonicalDigest(expected.accountRules as StableHashValue)
    && canonicalDigest(projectPolicy.rules as StableHashValue)
      === canonicalDigest(expected.projectRules as StableHashValue)
}

function boundedCdpPolicyRules(value: unknown): readonly JsonValue[] | undefined {
  if (
    !Array.isArray(value)
    || value.length < 1
    || value.length > MAX_CDP_POLICY_RULES
    || !isBoundedJsonValue(value)
    || value.some((rule) => !isRecord(rule))
  ) return undefined
  return value
}
