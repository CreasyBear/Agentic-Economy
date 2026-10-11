export type ProviderConnectionInspection = Readonly<{
  digest: string
  payTo: string
  amount: string
  network: string
  asset: string
  claimMessage: string
  claimExpiresAt: number
}>

/** OAuth authorization endpoints must be https; http only for loopback (RFC 8252, MCP authorization spec). */
export function isSafeAuthorizationUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    return url.protocol === 'https:' || (url.protocol === 'http:' && loopback)
  } catch {
    return false
  }
}
