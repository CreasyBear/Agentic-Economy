import type { CsrfCheckInput } from '@/modules/security/public'

export function matchingCsrf(_key: string): CsrfCheckInput {
  return {
    origin: 'https://ae.example',
    allowedOrigins: ['https://ae.example'],
  }
}
