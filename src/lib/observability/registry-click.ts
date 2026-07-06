import { emitFunnelEvent } from '@/lib/observability/funnel-client'

export type EmitRegistryResultClickInput = {
  slug: string
  query: string
  position: number
}

export function emitRegistryResultClick(input: EmitRegistryResultClickInput): Promise<void> {
  return emitFunnelEvent({
    eventType: 'service_registry_result_clicked',
    stage: 'visitor',
    correlationPrefix: `registry-result-click:${input.slug}`,
    payload: {
      slug: input.slug,
      queryLength: input.query.length,
      resultPosition: input.position,
    },
  })
}
