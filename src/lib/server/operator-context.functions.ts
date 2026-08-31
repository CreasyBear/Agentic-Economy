import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import type { OperatorContextReadResult } from '@/lib/operator/operator-context'

const readCurrentOperatorContextQuery = sourceQuery<
  Record<string, never>,
  OperatorContextReadResult
>('operatorContext:readCurrent')

export async function readOperatorContextThroughSource(): Promise<OperatorContextReadResult> {
  return await callSourceQuery(readCurrentOperatorContextQuery, {})
}
