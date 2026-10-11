import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(value).buffer))
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  let mismatch = left.byteLength ^ right.byteLength
  for (let index = 0; index < left.byteLength; index += 1) {
    mismatch |= left[index]! ^ (right[index] ?? 0)
  }
  return mismatch === 0
}

/** Constant-time bearer check of an internal RPC channel token (digest compare). */
export async function rpcChannelAuthenticated(
  request: Request,
  environment: StringEnvironment,
  tokenName: string,
): Promise<boolean> {
  const authorization = request.headers.get('authorization')
  const supplied = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined
  const configured = readTrimmedEnv(environment, tokenName)
  if (supplied === undefined || configured === undefined
    || !TOKEN_PATTERN.test(supplied) || !TOKEN_PATTERN.test(configured)) return false
  const encoder = new TextEncoder()
  return bytesEqual(await sha256(encoder.encode(supplied)), await sha256(encoder.encode(configured)))
}
