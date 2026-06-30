import { lazy, type ReactNode } from 'react'
import { z } from 'zod'

import type { AnswerSource } from '@/modules/answer/answer-synthesizer'

export const aeOpenUiLibraryPromise = import('./ae-library').then((mod) => mod.aeOpenUiLibrary)

export const AeOpenUIRendererLazy = lazy(async () => {
  const [{ Renderer }, { aeOpenUiLibrary }] = await Promise.all([
    import('@openuidev/react-lang'),
    import('./ae-library'),
  ])

  return {
    default: function AeOpenUIRenderer(props: { response: string | null; isStreaming?: boolean }) {
      return <Renderer library={aeOpenUiLibrary} response={props.response} isStreaming={props.isStreaming ?? false} />
    },
  }
})

export type AeOpenUiRendererProps = {
  response: string | null
  isStreaming?: boolean
}

export const AnswerStackProviderCardsSchema = z.object({
  providers: z.array(
    z.object({
      citationIndex: z.number(),
      slug: z.string(),
      name: z.string(),
      category: z.string(),
      suburb: z.string(),
      stateTerritory: z.string(),
      serviceArea: z.string(),
      hoursLabel: z.string(),
      availabilityLabel: z.string(),
      trustLabel: z.string(),
      responseTimeLabel: z.string(),
      trustCue: z.string(),
      photoUrl: z.string().optional(),
      nextStepLabel: z.string(),
      detailUrl: z.string(),
      inquiryUrl: z.string().optional(),
      services: z.array(
        z.object({
          name: z.string(),
          category: z.string(),
          summary: z.string(),
        }),
      ),
    }),
  ),
})

export type AnswerStackProviderCards = {
  providers: AnswerSource[]
}
