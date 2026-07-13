import { routingV1RetiredResponse } from './retirement'

const DESCRIPTOR_PATH = '/.well-known/ae-routing.json'

export function handleRoutingKernelDescriptorRequest(request: Request): Response {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } })
  if (new URL(request.url).pathname !== DESCRIPTOR_PATH) return new Response(null, { status: 404 })
  return routingV1RetiredResponse()
}
