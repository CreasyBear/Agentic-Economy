export const base64Codec = {
  toBase64(bytes: Uint8Array): string {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  },

  fromBase64(value: string): Uint8Array<ArrayBuffer> {
    const binary = atob(value)
    const bytes = new Uint8Array(new ArrayBuffer(binary.length))
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  },

  toBase64Url(bytes: Uint8Array): string {
    return this.toBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
  },

  fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/')
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
    return this.fromBase64(`${padded}${pad}`)
  },
} as const

export function tryDecodeBase64Url(value: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return undefined
  try {
    return base64Codec.fromBase64Url(value)
  } catch {
    return undefined
  }
}
