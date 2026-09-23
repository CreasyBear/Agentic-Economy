import { z } from 'zod'

const clarifyChoice = z.string().trim().min(1).max(80)

export const chatClarifyInputSchema = z.strictObject({
  question: z.string().trim().min(1).max(200),
  choices: z.tuple([clarifyChoice, clarifyChoice, clarifyChoice]),
})

export const chatClarifyOutputSchema = z.strictObject({
  question: z.string().trim().min(1).max(200),
  status: z.literal('awaiting_answer'),
})

export function storedClarifyAnswer(value: unknown): string | undefined {
  const parsed = z.string().trim().min(1).max(2_000).safeParse(value)
  return parsed.success ? parsed.data : undefined
}
