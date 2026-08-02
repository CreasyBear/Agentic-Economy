export type CookieSerializeOptions = Readonly<{
  path?: string
  maxAge?: number
  httpOnly?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  secure?: boolean
}>

export function readCookie(header: string | null, name: string): string | undefined {
  if (header === null) return undefined

  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0 || part.slice(0, separator).trim() !== name) continue
    try {
      const decoded = decodeURIComponent(part.slice(separator + 1).trim()).trim()
      return decoded.length > 0 ? decoded : undefined
    } catch {
      return undefined
    }
  }

  return undefined
}

export function serializeCookie(name: string, value: string, options: CookieSerializeOptions = {}): string {
  const attributes = [`${name}=${encodeURIComponent(value)}`]
  if (options.path !== undefined) attributes.push(`Path=${options.path}`)
  if (options.maxAge !== undefined) attributes.push(`Max-Age=${options.maxAge}`)
  if (options.httpOnly === true) attributes.push('HttpOnly')
  if (options.sameSite !== undefined) attributes.push(`SameSite=${options.sameSite}`)
  if (options.secure === true) attributes.push('Secure')
  return attributes.join('; ')
}

export function isSecureRequest(
  request: Pick<Request, 'headers' | 'url'>,
  env: Readonly<{ NODE_ENV?: string }> = {},
): boolean {
  if (env.NODE_ENV === 'production') return true

  const forwarded = request.headers.get('x-forwarded-proto')
  if (forwarded !== null) return forwarded.split(',')[0]?.trim().toLowerCase() === 'https'

  try {
    return new URL(request.url).protocol === 'https:'
  } catch {
    return false
  }
}
