import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export type AuthoritativePreparedWork = Readonly<{
  lineageRef: string
  version: number
  input: StableHashValue
  materialInputDigest: string
  projectionVersion: number
  authorityState: 'fresh_required' | 'available'
}>

export type PreparedWorkCorrection =
  | Readonly<{
      kind: 'presentation_only'
      work: AuthoritativePreparedWork
      presentation: StableHashValue
      invalidatedProjectionVersion: null
    }>
  | Readonly<{
      kind: 'material'
      work: AuthoritativePreparedWork
      invalidatedProjectionVersion: number
      invalidatedAuthority: true
    }>

export function createAuthoritativePreparedWork(input: Readonly<{
  lineageRef: string
  value: StableHashValue
}>): AuthoritativePreparedWork {
  if (input.lineageRef.trim().length === 0) throw new Error('prepared_work_lineage_required')
  return {
    lineageRef: input.lineageRef,
    version: 1,
    input: input.value,
    materialInputDigest: canonicalDigest(input.value),
    projectionVersion: 1,
    authorityState: 'fresh_required',
  }
}

export function applyPreparedWorkCorrection(input: Readonly<{
  current: AuthoritativePreparedWork
  value: StableHashValue
  classification: 'material' | 'presentation_only'
}>): PreparedWorkCorrection {
  if (input.classification === 'presentation_only') {
    return {
      kind: 'presentation_only',
      work: input.current,
      presentation: input.value,
      invalidatedProjectionVersion: null,
    }
  }
  const digest = canonicalDigest(input.value)
  if (digest === input.current.materialInputDigest) {
    throw new Error('material_correction_unchanged')
  }
  return {
    kind: 'material',
    work: {
      lineageRef: input.current.lineageRef,
      version: input.current.version + 1,
      input: input.value,
      materialInputDigest: digest,
      projectionVersion: input.current.projectionVersion + 1,
      authorityState: 'fresh_required',
    },
    invalidatedProjectionVersion: input.current.projectionVersion,
    invalidatedAuthority: true,
  }
}
