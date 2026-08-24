export type MatchingCsrfInput = Readonly<{
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  allowedOrigins: readonly string[]
}>

export function matchingCsrf(_key: string): MatchingCsrfInput {
  return {
    origin: 'https://ae.example',
    allowedOrigins: ['https://ae.example'],
  }
}
