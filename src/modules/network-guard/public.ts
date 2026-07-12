import type { LookupAddress, LookupOptions } from 'node:dns'
import { lookup as nodeDnsLookup } from 'node:dns/promises'
import { isIP, type LookupFunction } from 'node:net'

export type ResolvedAddress = {
  address: string
  family?: number
}

export type DnsResolver = {
  lookup(hostname: string): Promise<readonly ResolvedAddress[]>
}

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

  const ipv4 = parseIpv4(normalized)
  if (ipv4 !== undefined) {
    return !isBlockedIpv4(ipv4)
  }

  const ipv6 = parseIpv6(normalized)
  if (ipv6 === undefined) {
    return false
  }

  const mappedIpv4 = readIpv4MappedIpv6(ipv6)
  if (mappedIpv4 !== undefined) {
    return !isBlockedIpv4(mappedIpv4)
  }

  return !isBlockedIpv6(ipv6)
}

function parseIpv4(value: string): number | undefined {
  const parts = value.split('.')
  if (parts.length !== 4) {
    return undefined
  }

  let result = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return undefined
    }
    const octet = Number(part)
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return undefined
    }
    result = (result << 8) | octet
  }

  return result >>> 0
}

function isBlockedIpv4(ip: number): boolean {
  return (
    inIpv4Cidr(ip, '0.0.0.0', 8) ||
    inIpv4Cidr(ip, '10.0.0.0', 8) ||
    inIpv4Cidr(ip, '100.64.0.0', 10) ||
    inIpv4Cidr(ip, '127.0.0.0', 8) ||
    inIpv4Cidr(ip, '169.254.0.0', 16) ||
    inIpv4Cidr(ip, '172.16.0.0', 12) ||
    inIpv4Cidr(ip, '192.168.0.0', 16) ||
    inIpv4Cidr(ip, '224.0.0.0', 4) ||
    inIpv4Cidr(ip, '240.0.0.0', 4)
  )
}

function inIpv4Cidr(ip: number, base: string, bits: number): boolean {
  const baseIp = parseIpv4(base)
  if (baseIp === undefined) {
    return false
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (ip & mask) === (baseIp & mask)
}

function parseIpv6(value: string): Uint8Array | undefined {
  let normalized = value.toLowerCase()
  const zoneIndex = normalized.indexOf('%')
  if (zoneIndex !== -1) {
    normalized = normalized.slice(0, zoneIndex)
  }

  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':')
    if (lastColon === -1) {
      return undefined
    }
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1))
    if (ipv4 === undefined) {
      return undefined
    }
    const high = ((ipv4 >>> 16) & 0xffff).toString(16)
    const low = (ipv4 & 0xffff).toString(16)
    normalized = `${normalized.slice(0, lastColon)}:${high}:${low}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) {
    return undefined
  }

  const left = splitIpv6Hextets(halves[0] ?? '')
  const right = halves.length === 2 ? splitIpv6Hextets(halves[1] ?? '') : []
  if (left === undefined || right === undefined) {
    return undefined
  }

  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 0)) {
    return undefined
  }

  const hextets = [...left, ...Array.from({ length: missing }, () => 0), ...right]
  if (hextets.length !== 8) {
    return undefined
  }

  const bytes = new Uint8Array(16)
  for (let index = 0; index < hextets.length; index += 1) {
    const hextet = hextets[index] ?? 0
    bytes[index * 2] = hextet >> 8
    bytes[index * 2 + 1] = hextet & 0xff
  }
  return bytes
}

function splitIpv6Hextets(value: string): number[] | undefined {
  if (value.length === 0) {
    return []
  }

  const hextets: number[] = []
  for (const part of value.split(':')) {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) {
      return undefined
    }
    hextets.push(Number.parseInt(part, 16))
  }
  return hextets
}

function readIpv4MappedIpv6(bytes: Uint8Array): number | undefined {
  for (let index = 0; index < 10; index += 1) {
    if (bytes[index] !== 0) {
      return undefined
    }
  }

  if (bytes[10] !== 0xff || bytes[11] !== 0xff) {
    return undefined
  }

  return (((bytes[12] ?? 0) << 24) | ((bytes[13] ?? 0) << 16) | ((bytes[14] ?? 0) << 8) | (bytes[15] ?? 0)) >>> 0
}

function isBlockedIpv6(bytes: Uint8Array): boolean {
  const allZero = bytes.every((byte) => byte === 0)
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1
  const uniqueLocal = ((bytes[0] ?? 0) & 0xfe) === 0xfc
  const linkLocal = bytes[0] === 0xfe && ((bytes[1] ?? 0) & 0xc0) === 0x80
  const multicast = bytes[0] === 0xff

  return allZero || loopback || uniqueLocal || linkLocal || multicast
}
