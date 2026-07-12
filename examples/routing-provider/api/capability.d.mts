import type { Readable } from 'node:stream'

type ProviderRequest = Readable & {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

type ProviderResponse = {
  setHeader(name: string, value: string): void
  status(value: number): ProviderResponse
  send(value: string): ProviderResponse
}

export default function handler(request: ProviderRequest, response: ProviderResponse): Promise<unknown>
