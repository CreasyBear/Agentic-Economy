import { readAnswerTurnFrames, type AnswerTurnFrame } from '@/modules/answer/public'

/**
 * Drains an `/api/answer/turn` response through the same reader the browser
 * uses, so a wire-format change cannot pass the suite by only breaking clients.
 */
export async function readAnswerTurnStream(
  response: Response,
  onFrame?: (frame: AnswerTurnFrame) => void,
): Promise<AnswerTurnFrame[]> {
  if (response.body === null) return []
  const frames: AnswerTurnFrame[] = []
  for await (const frame of readAnswerTurnFrames(response.body)) {
    frames.push(frame)
    onFrame?.(frame)
  }
  return frames
}

export type { AnswerTurnFrame }
