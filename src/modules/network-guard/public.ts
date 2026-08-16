import type { LookupAddress, LookupOptions } from 'node:dns'
import { lookup as nodeDnsLookup } from 'node:dns/promises'
import { BlockList, isIP, SocketAddress, type LookupFunction } from 'node:net'

export type ResolvedAddress = {
  address: string
  family?: number
}

export type DnsResolver = {
  lookup(hostname: string): Promise<readonly ResolvedAddress[]>
}

const blockedAddressRanges = new BlockList()
blockedAddressRanges.addSubnet('0.0.0.0', 8, 'ipv4')
blockedAddressRanges.addSubnet('10.0.0.0', 8, 'ipv4')
blockedAddressRanges.addSubnet('100.64.0.0', 10, 'ipv4')
blockedAddressRanges.addSubnet('127.0.0.0', 8, 'ipv4')
blockedAddressRanges.addSubnet('169.254.0.0', 16, 'ipv4')
blockedAddressRanges.addSubnet('172.16.0.0', 12, 'ipv4')
blockedAddressRanges.addSubnet('192.168.0.0', 16, 'ipv4')
blockedAddressRanges.addSubnet('198.18.0.0', 15, 'ipv4')
blockedAddressRanges.addSubnet('224.0.0.0', 4, 'ipv4')
blockedAddressRanges.addSubnet('240.0.0.0', 4, 'ipv4')
blockedAddressRanges.addSubnet('::', 128, 'ipv6')
blockedAddressRanges.addSubnet('::1', 128, 'ipv6')
blockedAddressRanges.addSubnet('fc00::', 7, 'ipv6')
blockedAddressRanges.addSubnet('fec0::', 10, 'ipv6')
blockedAddressRanges.addSubnet('fe80::', 10, 'ipv6')
blockedAddressRanges.addSubnet('ff00::', 8, 'ipv6')

export const defaultDnsResolver: DnsResolver = {
  async lookup(hostname: string) {
    return nodeDnsLookup(hostname, { all: true, verbatim: true })
  },
}

export async function isPublicHttpTarget(url: URL, resolver: DnsResolver): Promise<boolean> {
  const hostname = normalizeHostname(url.hostname)
  if (hostname === undefined || isBlockedHostname(hostname)) {
    return false
  }

  if (isIP(hostname) !== 0) {
    return isPublicIpAddress(hostname)
  }

  let addresses: readonly ResolvedAddress[]
  try {
    addresses = await resolver.lookup(hostname)
  } catch {
    return false
  }

  return addresses.length > 0 && addresses.every(({ address }) => !isBlockedAddress(address))
}

export function createGuardedLookup(resolver: DnsResolver): LookupFunction {
  return (hostname: string, options: LookupOptions, callback) => {
    const normalizedHostname = normalizeHostname(hostname)
    if (normalizedHostname === undefined || isBlockedHostname(normalizedHostname)) {
      callback(createLookupRefusalError(), '', 0)
      return
    }

    if (isIP(normalizedHostname) !== 0) {
      if (!isPublicIpAddress(normalizedHostname)) {
        callback(createLookupRefusalError(), '', 0)
        return
      }
      if (options.all === true) {
        callback(null, [toLookupAddress(normalizedHostname)])
        return
      }
      callback(null, normalizedHostname, isIP(normalizedHostname))
      return
    }

    void resolver.lookup(normalizedHostname).then(
      (addresses) => {
        if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
          callback(createLookupRefusalError(), '', 0)
          return
        }

        const vettedAddresses = addresses.map(({ address, family }) => toLookupAddress(address, family))
        if (options.all === true) {
          callback(null, vettedAddresses)
          return
        }

        const firstAddress = vettedAddresses[0]
        if (firstAddress === undefined) {
          callback(createLookupRefusalError(), '', 0)
          return
        }
        callback(null, firstAddress.address, firstAddress.family)
      },
      () => {
        callback(createLookupRefusalError(), '', 0)
      }
    )
  }
}

function isBlockedAddress(value: string): boolean {
  return !isPublicIpAddress(value)
}

function toLookupAddress(address: string, family = isIP(address)): LookupAddress {
  return {
    address,
    family: family === 6 ? 6 : 4,
  }
}

function createLookupRefusalError(): NodeJS.ErrnoException {
  const error = new Error('Storefront importer refused a non-public DNS resolution.') as NodeJS.ErrnoException
  error.code = 'ECONNREFUSED'
  return error
}

function normalizeHostname(hostname: string): string | undefined {
  const trimmed = hostname.trim().toLowerCase()
  if (trimmed.length === 0) {
    return undefined
  }

  const withoutBrackets = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed
  const withoutTrailingDot = withoutBrackets.endsWith('.') ? withoutBrackets.slice(0, -1) : withoutBrackets
  return withoutTrailingDot.length === 0 ? undefined : withoutTrailingDot
}

function isBlockedHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === 'local' || hostname.endsWith('.local')
}


function isPublicIpAddress(value: string): boolean {
  const normalized = normalizeHostname(value)
  if (normalized === undefined) {
    return false
  }

  const family = isIP(normalized)
  if (family === 0) {
    return false
  }

  try {
    const mappedIpv4 = family === 6 ? extractMappedIpv4Address(normalized) : undefined
    if (mappedIpv4 !== undefined) {
      return !blockedAddressRanges.check(mappedIpv4, 'ipv4')
    }
    return !blockedAddressRanges.check(normalized, family === 6 ? 'ipv6' : 'ipv4')
  } catch {
    return false
  }
}

function extractMappedIpv4Address(value: string): string | undefined {
  const zoneIndex = value.indexOf('%')
  const withoutZone = zoneIndex === -1 ? value : value.slice(0, zoneIndex)
  let parsed: SocketAddress | undefined
  try {
    parsed = SocketAddress.parse(`[${withoutZone}]:0`)
  } catch {
    return undefined
  }
  if (parsed === undefined || parsed.family !== 'ipv6' || !parsed.address.startsWith('::ffff:')) {
    return undefined
  }
  const mappedIpv4 = parsed.address.slice('::ffff:'.length)
  return isIP(mappedIpv4) === 4 ? mappedIpv4 : undefined
}

