import { ExactEvmScheme } from '@x402/evm/exact/server'
import type { Network } from '@x402/core/types'
import { isRecord } from '@/modules/common/is-record'

const namedNetworks: Readonly<Record<string, string>> = {
  'eip155:8453': 'Base', base: 'Base',
  'eip155:84532': 'Base Sepolia', 'base-sepolia': 'Base Sepolia',
  'eip155:1': 'Ethereum', ethereum: 'Ethereum',
  'eip155:42161': 'Arbitrum One', 'arbitrum-one': 'Arbitrum One',
  'eip155:10': 'OP Mainnet', 'op-mainnet': 'OP Mainnet',
  'eip155:137': 'Polygon', polygon: 'Polygon',
  'eip155:43114': 'Avalanche', avalanche: 'Avalanche',
}
const exactEvm = new ExactEvmScheme()
const defaultAssetSymbols: Readonly<Record<string, string>> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0x036cbd53842c5426634e7929541ec2318f3dcf7e': 'USDC',
  '0xfafddbb3fc7688494971a79cc65dca3ef82079e7': 'MegaUSD',
  '0x754704bc059f8c67012fed69bc8a327a5aafb603': 'USDC',
  '0x779ded0c9e1022225f8e0630b35a9b54be713736': 'USDT0',
  '0x78cf24370174180738c5b8e352b6d14c83a6c9a9': 'USDT0',
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'USDC',
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC',
  '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d': 'USDC',
  '0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186': 'mUSD',
  '0x118917a40faf1cd7a13db0ef56c86de7973ac503': 'mUSD',
  '0x33ad9e4bd16b69b5bfded37d8b5d9ff9aba014fb': 'SBC',
  '0x9cb8142aebbcdc60af7c97af897a67a8f3ca71c2': 'USDC.e',
  '0x401ecb1d350407f13ba348573e5630b83638e30d': 'USDC.e',
  '0xfa2958cb79b0491cc627c1557f441ef849ca8eb1': 'USDC',
  '0xb5ab69f7bbada22b28e79c8ffaece55ef1c771d4': 'USDC',
  '0xa5b8bf902b2844da17d4506cc827f7f1681735e7': 'USDC',
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': 'USDT0',
  '0xceba9300f2b948710d2653dd7b07f33a8b32118c': 'USDC',
  '0x01c5c0122039549ad1493b8220cabedd739bc44e': 'USDC',
}

/** Names a declared x402 network for display; unknown networks read back verbatim. */
export function x402NetworkLabel(network: string): string {
  if (network === 'solana' || network === 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp') return 'Solana'
  if (network === 'solana-devnet' || network === 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1') return 'Solana Devnet'
  return namedNetworks[network] ?? network
}

/** Resolves x402's public exact-server decimal lookup and its default-token display labels. */
export function x402DefaultAssetFacts(assetId: string, network: string): Readonly<{ symbol: string; decimals: number }> | undefined {
  const decimals = exactEvm.getAssetDecimals(assetId, network as Network)
  if (decimals === undefined) return undefined
  const symbol = defaultAssetSymbols[assetId.toLowerCase()] ?? (/^0x/i.test(assetId) ? undefined : assetId)
  return symbol === undefined ? undefined : { symbol, decimals }
}

/** Projects legacy v1 discovery fields without the Node-only Bazaar SDK. */
export function x402LegacyDiscoveryInfo(accepted: unknown): unknown {
  if (accepted === undefined || accepted === null) return undefined
  if (isRecord(accepted) === false) return null
  const outputSchema = accepted.outputSchema
  if (isRecord(outputSchema) === false) return null
  const input = outputSchema.input
  if (isRecord(input) === false) return null
  const output = outputSchema.output
  if (input.type !== 'http' || input.discoverable === false || input.discoverable === 0 || input.discoverable === '' || typeof input.method !== 'string') return null
  const method = input.method.toUpperCase()
  if (!['GET', 'HEAD', 'DELETE', 'POST', 'PUT', 'PATCH'].includes(method)) return null
  const queryParams = [input.queryParams, input.query_params, input.query, input.params].find(isRecord)
  const headers = [input.headerFields, input.header_fields, input.headers].find(isRecord)
  if (method === 'GET' || method === 'HEAD' || method === 'DELETE') {
    return { input: { type: 'http', method, ...(queryParams === undefined ? {} : { queryParams }), ...(headers === undefined ? {} : { headers }) },
      ...(output ? { output: { type: 'json', example: output } } : {}) }
  }
  const declaredBodyType = input.bodyType || input.body_type
  const bodyType = typeof declaredBodyType === 'string' && /form|multipart/iu.test(declaredBodyType) ? 'form-data'
    : typeof declaredBodyType === 'string' && /text|plain/iu.test(declaredBodyType) ? 'text' : 'json'
  const body = [input.bodyFields, input.body_fields, input.bodyParams, input.body, input.data, input.properties].find(isRecord) ?? {}
  return { input: { type: 'http', method, bodyType, body, ...(queryParams === undefined ? {} : { queryParams }), ...(headers === undefined ? {} : { headers }) },
    ...(output ? { output: { type: 'json', example: output } } : {}) }
}
