declare const toolRefBrand: unique symbol

export type PublicToolRef = string & Readonly<{ [toolRefBrand]: true }>

export function isPublicToolRef(value: unknown): value is PublicToolRef {
  return typeof value === 'string' && /^operation:v1:[0-9a-f]{64}$/.test(value)
}

export type CallableRef = Readonly<{ kind: 'operation' | 'listing' | 'url'; ref: string }>

const MAX_CALLABLE_URL_LENGTH = 8192

/**
 * The one parser for what a caller may name to Quote: an operation ref, a directory listing id,
 * or a raw https URL. Only the first is a Tool; Quote resolves the other two to one. A URL is
 * accepted here for shape only, and Quote resolves it solely for an authenticated agent key.
 */
export function parseCallableRef(value: unknown): CallableRef | undefined {
  if (typeof value !== 'string') return undefined
  if (isPublicToolRef(value)) return { kind: 'operation', ref: value }
  if (/^registry:[0-9a-f]{64}$/u.test(value)) return { kind: 'listing', ref: value }
  if (value.length > MAX_CALLABLE_URL_LENGTH || !value.startsWith('https://') || /\s/u.test(value)) return undefined
  // try/catch, not URL.canParse: this module also runs in the Convex default runtime.
  try { void new URL(value) } catch { return undefined }
  return { kind: 'url', ref: value }
}
