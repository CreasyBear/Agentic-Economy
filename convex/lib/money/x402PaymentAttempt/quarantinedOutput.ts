import { isCanonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { parseBoundedJson } from '../../../../src/modules/common/bounded-json'
import type { RecordObservationArgs } from './contracts'

const MAX_QUARANTINED_OUTPUT_BYTES = 512 * 1024

type QuarantinedOutput = Readonly<{
  responseDigest: string
  outputJson: string
}>

export function quarantinedOutputFromArgs(args: Pick<RecordObservationArgs,
  'settlementStatus' | 'quarantinedResponseDigest' | 'quarantinedOutputJson'>): QuarantinedOutput | undefined {
  const responseDigest = args.quarantinedResponseDigest
  const outputJson = args.quarantinedOutputJson
  if ((responseDigest === undefined) !== (outputJson === undefined)) {
    throw new Error('x402_payment_quarantined_output_invalid')
  }
  if (responseDigest === undefined || outputJson === undefined) return undefined
  if (
    (args.settlementStatus !== 'unknown' && args.settlementStatus !== 'settled')
    || !isCanonicalDigest(responseDigest)
    || new TextEncoder().encode(outputJson).byteLength
      > MAX_QUARANTINED_OUTPUT_BYTES
  ) throw new Error('x402_payment_quarantined_output_invalid')
  const parsed = parseBoundedJson(outputJson)
  if (
    parsed === undefined
    || JSON.stringify(parsed) !== outputJson
  ) throw new Error('x402_payment_quarantined_output_invalid')
  return {
    responseDigest,
    outputJson,
  }
}

export function quarantinedOutputFromRow(
  row: Readonly<{
    quarantinedResponseDigest?: string
    quarantinedOutputJson?: string
  }>,
): QuarantinedOutput | undefined {
  const responseDigest = row.quarantinedResponseDigest
  const outputJson = row.quarantinedOutputJson
  if ((responseDigest === undefined) !== (outputJson === undefined)) {
    throw new Error('x402_payment_quarantined_output_conflict')
  }
  if (responseDigest === undefined || outputJson === undefined) return undefined
  return {
    responseDigest,
    outputJson,
  }
}

export function sameQuarantinedOutput(
  left: QuarantinedOutput | undefined,
  right: QuarantinedOutput | undefined,
): boolean {
  return left?.responseDigest === right?.responseDigest
    && left?.outputJson === right?.outputJson
}
