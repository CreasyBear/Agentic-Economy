"use node"

import { CdpClient } from '@coinbase/cdp-sdk'
import { v } from 'convex/values'

import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import {
  cdpX402CustodyConfigurationFromEnvironment,
  type CdpX402CustodyConfiguration,
} from '@/modules/capability-supply/convex'
import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  cdpX402PolicyRulesDigest,
  cdpX402SellerCanaryPolicyIsExact,
} from '@/modules/capability-supply/server'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, internalAction, type ActionCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import {
  SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
} from './capabilitySupplyCanaryFunding'

const MAX_BALANCE_PAGES = 10
const BALANCE_PAGE_SIZE = 100
const EXPECTED_USDC_DECIMALS = 6
/** CDP SDK network ids for the USDC lanes AE custodies (sandbox, production). */
export type CdpUsdcNetwork = 'base-sepolia' | 'base'
const CDP_BASE_SEPOLIA_NETWORK: CdpUsdcNetwork = 'base-sepolia'

export type SellerOnboardingCanaryCdpPreflightCode =
  | 'authorization_denied'
  | 'ae_canary_funding_not_ready'
  | 'route_call_signing_configuration_missing'
  | 'route_call_signing_configuration_invalid'
  | 'cdp_custody_configuration_missing'
  | 'cdp_client_initialization_failed'
  | 'cdp_account_read_failed'
  | 'cdp_account_name_mismatch'
  | 'cdp_account_address_mismatch'
  | 'cdp_account_policy_ids_not_verifiable'
  | 'cdp_account_policy_ids_mismatch'
  | 'cdp_account_policy_read_failed'
  | 'cdp_project_policy_read_failed'
  | 'cdp_account_policy_document_invalid'
  | 'cdp_project_policy_document_invalid'
  | 'cdp_policy_rules_digest_not_verifiable'
  | 'cdp_policy_rules_digest_mismatch'
  | 'cdp_seller_canary_policy_profile_mismatch'
  | 'cdp_balance_read_failed'
  | 'cdp_usdc_balance_not_verifiable'
  | 'cdp_usdc_balance_insufficient'

export type SellerOnboardingCanaryCdpPreflightResult =
  | Readonly<{
      kind: 'ready'
      accountName: string
      payerAddress: string
      accountPolicyId: string
      projectPolicyId: string
      policyRulesDigest: string
      network: typeof BASE_SEPOLIA_NETWORK
      asset: typeof BASE_SEPOLIA_USDC_ADDRESS
      usdcBalanceAtomic: string
      minimumRequiredAtomic: typeof SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC
      balancePagesRead: number
      checkedAt: number
    }>
  | Readonly<{
      kind: 'not_ready'
      codes: SellerOnboardingCanaryCdpPreflightCode[]
      checkedAt: number
    }>

type CdpPolicyDocument = Readonly<{
  id: string
  scope: 'account' | 'project'
  rules: readonly unknown[]
}>

type CdpPreflightClient = Readonly<{
  evm: Readonly<{
    getAccount: (options: Readonly<{ name: string }>) => Promise<Readonly<{
      name?: string
      address: string
      policies?: readonly string[]
    }>>
    listTokenBalances: (options: Readonly<{
      address: `0x${string}`
      network: CdpUsdcNetwork
      pageSize: number
      pageToken?: string
    }>) => Promise<Readonly<{
      balances: readonly Readonly<{
        token: Readonly<{
          contractAddress: string
          network: string
        }>
        amount: Readonly<{
          amount: bigint
          decimals: number
        }>
      }>[]
      nextPageToken?: string
    }>>
  }>
  policies: Readonly<{
    getPolicyById: (
      options: Readonly<{ id: string }>,
    ) => Promise<CdpPolicyDocument>
  }>
}>

export type SellerOnboardingCanaryCdpPreflightDependencies = Readonly<{
  environment?: StringEnvironment
  createClient?: (configuration: CdpX402CustodyConfiguration) => CdpPreflightClient
}>

function createOfficialCdpPreflightClient(
  configuration: CdpX402CustodyConfiguration,
): CdpPreflightClient {
  const client = new CdpClient({
    apiKeyId: configuration.apiKeyId,
    apiKeySecret: configuration.apiKeySecret,
    walletSecret: configuration.walletSecret,
  })
  return {
    evm: {
      getAccount: async (options) => {
        const account = await client.evm.getAccount(options)
        return {
          address: account.address,
          ...(account.name === undefined ? {} : { name: account.name }),
          ...(account.policies === undefined ? {} : { policies: account.policies }),
        }
      },
      listTokenBalances: async (options) => client.evm.listTokenBalances(options),
    },
    policies: {
      getPolicyById: async (options) => {
        const policy = await client.policies.getPolicyById(options)
        return {
          id: policy.id,
          scope: policy.scope,
          rules: policy.rules,
        }
      },
    },
  }
}

const codeValue = v.union(
  v.literal('authorization_denied'),
  v.literal('ae_canary_funding_not_ready'),
  v.literal('route_call_signing_configuration_missing'),
  v.literal('route_call_signing_configuration_invalid'),
  v.literal('cdp_custody_configuration_missing'),
  v.literal('cdp_client_initialization_failed'),
  v.literal('cdp_account_read_failed'),
  v.literal('cdp_account_name_mismatch'),
  v.literal('cdp_account_address_mismatch'),
  v.literal('cdp_account_policy_ids_not_verifiable'),
  v.literal('cdp_account_policy_ids_mismatch'),
  v.literal('cdp_account_policy_read_failed'),
  v.literal('cdp_project_policy_read_failed'),
  v.literal('cdp_account_policy_document_invalid'),
  v.literal('cdp_project_policy_document_invalid'),
  v.literal('cdp_policy_rules_digest_not_verifiable'),
  v.literal('cdp_policy_rules_digest_mismatch'),
  v.literal('cdp_seller_canary_policy_profile_mismatch'),
  v.literal('cdp_balance_read_failed'),
  v.literal('cdp_usdc_balance_not_verifiable'),
  v.literal('cdp_usdc_balance_insufficient'),
)

const resultValue = v.union(
  v.object({
    kind: v.literal('ready'),
    accountName: v.string(),
    payerAddress: v.string(),
    accountPolicyId: v.string(),
    projectPolicyId: v.string(),
    policyRulesDigest: v.string(),
    network: v.literal(BASE_SEPOLIA_NETWORK),
    asset: v.literal(BASE_SEPOLIA_USDC_ADDRESS),
    usdcBalanceAtomic: v.string(),
    minimumRequiredAtomic: v.literal(SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC),
    balancePagesRead: v.number(),
    checkedAt: v.number(),
  }),
  v.object({
    kind: v.literal('not_ready'),
    codes: v.array(codeValue),
    checkedAt: v.number(),
  }),
)

function notReady(
  checkedAt: number,
  ...codes: SellerOnboardingCanaryCdpPreflightCode[]
): SellerOnboardingCanaryCdpPreflightResult {
  return { kind: 'not_ready', codes: [...new Set(codes)].sort(), checkedAt }
}

function normalizedPolicyIds(values: readonly string[]): string[] | undefined {
  if (values.length !== 2 || values.some((value) => typeof value !== 'string' || value.length === 0)) {
    return undefined
  }
  const normalized = values.map((value) => value.toLowerCase()).sort()
  return new Set(normalized).size === normalized.length ? normalized : undefined
}

function policyDocumentIsExact(
  policy: CdpPolicyDocument,
  expectedId: string,
  expectedScope: 'account' | 'project',
): boolean {
  return typeof policy.id === 'string'
    && policy.id.toLowerCase() === expectedId
    && policy.scope === expectedScope
    && Array.isArray(policy.rules)
}

async function readConfiguredPolicy(
  client: CdpPreflightClient,
  id: string,
): Promise<CdpPolicyDocument | undefined> {
  try {
    return await client.policies.getPolicyById({ id })
  } catch {
    return undefined
  }
}

/** The CDP read surface a USDC balance observation needs, and nothing more. */
export type CdpUsdcBalanceReader = Readonly<{
  listTokenBalances: CdpPreflightClient['evm']['listTokenBalances']
}>

/** Bounded, paginated USDC balance read for one CDP network/asset lane. */
export async function readCdpUsdcBalance(
  evm: CdpUsdcBalanceReader,
  address: `0x${string}`,
  lane: Readonly<{ network: CdpUsdcNetwork; assetAddress: string }>,
): Promise<
  | Readonly<{ kind: 'read'; amount: bigint; pagesRead: number }>
  | Readonly<{ kind: 'failed' }>
  | Readonly<{ kind: 'not_verifiable' }>
> {
  let pageToken: string | undefined
  let pagesRead = 0
  let amount: bigint | undefined
  const seenPageTokens = new Set<string>()
  while (pagesRead < MAX_BALANCE_PAGES) {
    let page: Awaited<ReturnType<CdpPreflightClient['evm']['listTokenBalances']>>
    try {
      page = await evm.listTokenBalances({
        address,
        network: lane.network,
        pageSize: BALANCE_PAGE_SIZE,
        ...(pageToken === undefined ? {} : { pageToken }),
      })
    } catch {
      return { kind: 'failed' }
    }
    pagesRead += 1
    for (const balance of page.balances) {
      if (
        balance.token.contractAddress.toLowerCase() !== lane.assetAddress.toLowerCase()
      ) continue
      if (
        amount !== undefined
        || balance.token.network !== lane.network
        || balance.amount.decimals !== EXPECTED_USDC_DECIMALS
        || typeof balance.amount.amount !== 'bigint'
        || balance.amount.amount < 0n
      ) return { kind: 'not_verifiable' }
      amount = balance.amount.amount
    }
    if (page.nextPageToken === undefined) {
      return { kind: 'read', amount: amount ?? 0n, pagesRead }
    }
    if (page.nextPageToken.length === 0 || seenPageTokens.has(page.nextPageToken)) {
      return { kind: 'not_verifiable' }
    }
    seenPageTokens.add(page.nextPageToken)
    pageToken = page.nextPageToken
  }
  return { kind: 'not_verifiable' }
}

/**
 * Executes only the official CDP 1.55 read APIs: named account, policy
 * documents, and Base Sepolia token balances.
 */
export async function inspectSellerOnboardingCanaryCdpReadiness(
  checkedAt: number,
  dependencies: SellerOnboardingCanaryCdpPreflightDependencies = {},
): Promise<SellerOnboardingCanaryCdpPreflightResult> {
  const environment = dependencies.environment ?? process.env
  const routeSigningKeyId = readTrimmedEnv(environment, 'AE_ROUTE_CALL_SIGNING_KEY_ID')
  const routeSigningSecret = readTrimmedEnv(environment, 'AE_ROUTE_CALL_SIGNING_SECRET')
  if (routeSigningKeyId === undefined && routeSigningSecret === undefined) {
    return notReady(checkedAt, 'route_call_signing_configuration_missing')
  }
  // Mirrors signRouteTransportCall's public input contract without deriving or
  // exposing any signature material during this read-only preflight.
  if (
    routeSigningKeyId === undefined
    || routeSigningSecret === undefined
    || routeSigningKeyId.length > 200
    || routeSigningSecret.length < 32
  ) return notReady(checkedAt, 'route_call_signing_configuration_invalid')

  const configuration = cdpX402CustodyConfigurationFromEnvironment(environment)
  if (configuration === undefined) {
    return notReady(checkedAt, 'cdp_custody_configuration_missing')
  }
  let client: CdpPreflightClient
  try {
    client = dependencies.createClient?.(configuration)
      ?? createOfficialCdpPreflightClient(configuration)
  } catch {
    return notReady(checkedAt, 'cdp_client_initialization_failed')
  }

  let account: Awaited<ReturnType<CdpPreflightClient['evm']['getAccount']>>
  try {
    account = await client.evm.getAccount({ name: configuration.accountName })
  } catch {
    return notReady(checkedAt, 'cdp_account_read_failed')
  }
  if (account.name !== configuration.accountName) {
    return notReady(checkedAt, 'cdp_account_name_mismatch')
  }
  if (
    !/^0x[0-9a-fA-F]{40}$/.test(account.address)
    || account.address.toLowerCase() !== configuration.expectedEvmAddress
  ) return notReady(checkedAt, 'cdp_account_address_mismatch')
  if (account.policies === undefined) {
    return notReady(checkedAt, 'cdp_account_policy_ids_not_verifiable')
  }
  const appliedPolicyIds = normalizedPolicyIds(account.policies)
  const expectedPolicyIds = [
    configuration.accountPolicyId,
    configuration.projectPolicyId,
  ].sort()
  if (
    appliedPolicyIds === undefined
    || appliedPolicyIds.some((id, index) => id !== expectedPolicyIds[index])
  ) return notReady(checkedAt, 'cdp_account_policy_ids_mismatch')

  const [accountPolicy, projectPolicy] = await Promise.all([
    readConfiguredPolicy(client, configuration.accountPolicyId),
    readConfiguredPolicy(client, configuration.projectPolicyId),
  ])
  if (accountPolicy === undefined) {
    return notReady(checkedAt, 'cdp_account_policy_read_failed')
  }
  if (projectPolicy === undefined) {
    return notReady(checkedAt, 'cdp_project_policy_read_failed')
  }
  if (!policyDocumentIsExact(accountPolicy, configuration.accountPolicyId, 'account')) {
    return notReady(checkedAt, 'cdp_account_policy_document_invalid')
  }
  if (!policyDocumentIsExact(projectPolicy, configuration.projectPolicyId, 'project')) {
    return notReady(checkedAt, 'cdp_project_policy_document_invalid')
  }
  const policyRulesDigest = cdpX402PolicyRulesDigest(accountPolicy, projectPolicy)
  if (policyRulesDigest === undefined) {
    return notReady(checkedAt, 'cdp_policy_rules_digest_not_verifiable')
  }
  if (policyRulesDigest !== configuration.policyRulesDigest) {
    return notReady(checkedAt, 'cdp_policy_rules_digest_mismatch')
  }
  if (!cdpX402SellerCanaryPolicyIsExact(
    accountPolicy,
    projectPolicy,
    account.address,
    configuration.maxAtomic.toString(),
  )) return notReady(checkedAt, 'cdp_seller_canary_policy_profile_mismatch')

  const balance = await readCdpUsdcBalance(
    client.evm,
    account.address as `0x${string}`,
    { network: CDP_BASE_SEPOLIA_NETWORK, assetAddress: BASE_SEPOLIA_USDC_ADDRESS },
  )
  if (balance.kind === 'failed') return notReady(checkedAt, 'cdp_balance_read_failed')
  if (balance.kind === 'not_verifiable') {
    return notReady(checkedAt, 'cdp_usdc_balance_not_verifiable')
  }
  const minimumRequired = BigInt(SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC)
  if (balance.amount < minimumRequired) {
    return notReady(checkedAt, 'cdp_usdc_balance_insufficient')
  }
  return {
    kind: 'ready',
    accountName: configuration.accountName,
    payerAddress: account.address.toLowerCase(),
    accountPolicyId: configuration.accountPolicyId,
    projectPolicyId: configuration.projectPolicyId,
    policyRulesDigest,
    network: BASE_SEPOLIA_NETWORK,
    asset: BASE_SEPOLIA_USDC_ADDRESS,
    usdcBalanceAtomic: balance.amount.toString(),
    minimumRequiredAtomic: SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
    balancePagesRead: balance.pagesRead,
    checkedAt,
  }
}

export async function readSellerOnboardingCanaryCdpReadinessHandler(
  ctx: ActionCtx,
  args: Readonly<{ now: number }>,
): Promise<SellerOnboardingCanaryCdpPreflightResult> {
  const configured = await ctx.runQuery(
    internal.capabilitySupplyCanaryFunding.readSellerOnboardingCanaryFundingReadiness,
    { now: args.now },
  )
  if (configured.kind !== 'ready') {
    return notReady(args.now, 'ae_canary_funding_not_ready')
  }
  return await inspectSellerOnboardingCanaryCdpReadiness(args.now, {
    environment: process.env,
  })
}

export const readSellerOnboardingCanaryCdpReadiness = internalAction({
  args: { now: v.number() },
  returns: resultValue,
  handler: readSellerOnboardingCanaryCdpReadinessHandler,
})

async function currentOwnerCanReadCanaryFunding(
  ctx: ActionCtx,
  businessId: Id<'businesses'>,
): Promise<boolean> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  return await ctx.runQuery(api.catalog.authorizeProviderBusiness, { businessId })
}

/**
 * Authenticated owner projection of the seller-canary funding preflight.
 *
 * This deliberately returns only the already-public readiness evidence. CDP
 * credentials, wallet secrets, and policy documents remain inside the Node
 * action and are never serialized to the caller.
 */
export const readOwnerSellerOnboardingCanaryCdpReadiness = action({
  args: { businessId: v.id('businesses') },
  returns: resultValue,
  handler: async (ctx, args): Promise<SellerOnboardingCanaryCdpPreflightResult> => {
    const checkedAt = Date.now()
    if (!await currentOwnerCanReadCanaryFunding(ctx, args.businessId)) {
      return notReady(checkedAt, 'authorization_denied')
    }
    return await readSellerOnboardingCanaryCdpReadinessHandler(ctx, { now: checkedAt })
  },
})
