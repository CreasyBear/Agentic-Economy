import { z } from 'zod'

export const AnswerProseSchema = z.object({
  oneLine: z.string().min(1).max(400),
  summary: z.string().min(1).max(4000),
  whatToDoNow: z.string().min(1).max(800),
})

export type AnswerProse = z.infer<typeof AnswerProseSchema>

/** Maps LLM prose to snapshot `nextStep` field. */
export function proseToNextStep(prose: AnswerProse): string {
  return prose.whatToDoNow
}

export function snapshotProseFromAnswer(prose: AnswerProse): {
  oneLine: string
  summary: string
  nextStep: string
} {
  return {
    oneLine: prose.oneLine,
    summary: prose.summary,
    nextStep: proseToNextStep(prose),
  }
}
