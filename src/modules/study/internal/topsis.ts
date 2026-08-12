import { z } from 'zod'

/**
 * Port of pymcdm 1.4.0 `pymcdm/methods/topsis.py` (MIT), `_method` lines
 * 62-78: normalize, weight, PIS/NIS, Euclidean distances, and closeness.
 * Its min-max donor is `pymcdm/normalizations.py` lines 35-40. The source was
 * retrieved from the pymcdm-1.4.0 wheel on 2026-08-01. Every intermediate is
 * retained here so a recommendation never hides its per-criterion contribution.
 */

export const topsisSenseSchema = z.enum(['benefit', 'cost'])
export type TopsisSense = z.infer<typeof topsisSenseSchema>

export const topsisCriterionSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  weight: z.number().finite().nonnegative(),
  sense: topsisSenseSchema,
})
export type TopsisCriterion = z.infer<typeof topsisCriterionSchema>

export type TopsisAlternativeInput = Readonly<{
  id?: string
  alternativeId?: string
  label?: string
  values: readonly number[] | Readonly<Record<string, number>>
}>

export type TopsisCriterionContribution = Readonly<{
  criterionId: string
  raw: number
  normalized: number
  weight: number
  weighted: number
  pisDelta: number
  nisDelta: number
  pisSquaredDistanceContribution: number
  nisSquaredDistanceContribution: number
}>

export type TopsisAlternativeScore = Readonly<{
  alternativeId: string
  label?: string
  criteria: readonly TopsisCriterionContribution[]
  pisDistanceSquared: number
  nisDistanceSquared: number
  pisDistance: number
  nisDistance: number
  closeness: number
  rank: number
}>

export type TopsisResult = Readonly<{
  criteria: readonly TopsisCriterion[]
  positiveIdealSolution: readonly number[]
  negativeIdealSolution: readonly number[]
  alternatives: readonly TopsisAlternativeScore[]
  winnerId: string
}>

export type TopsisInput = Readonly<{
  criteria: readonly TopsisCriterion[]
  alternatives: readonly TopsisAlternativeInput[]
}>
function requiredAt<T>(values: readonly T[], index: number, errorCode: string): T {
  if (index < 0 || index >= values.length) throw new Error(`${errorCode}:${index}`)
  const value = values[index]
  if (value === undefined) throw new Error(`${errorCode}:${index}`)
  return value
}

export function scoreTopsis(input: TopsisInput): TopsisResult {
  const criteria = input.criteria.map((criterion) => topsisCriterionSchema.parse(criterion))
  if (criteria.length === 0) throw new Error('topsis_criteria_empty')
  if (input.alternatives.length === 0) throw new Error('topsis_alternatives_empty')

  const weightTotal = criteria.reduce((sum, criterion) => sum + criterion.weight, 0)
  if (!Number.isFinite(weightTotal) || weightTotal <= 0) throw new Error('topsis_weights_invalid')

  const rows = input.alternatives.map((alternative, index) => {
    const alternativeId = alternative.alternativeId ?? alternative.id
    if (alternativeId === undefined || alternativeId.trim().length === 0) {
      throw new Error(`topsis_alternative_id_invalid:${index}`)
    }
    const values = criteria.map((criterion, criterionIndex) => readAlternativeValue(alternative, criterion.id, criterionIndex))
    return {
      alternativeId,
      ...(alternative.label === undefined ? {} : { label: alternative.label }),
      values,
    }
  })

  const normalized = rows.map((row) => row.values.map(() => 0))
  for (let criterionIndex = 0; criterionIndex < criteria.length; criterionIndex += 1) {
    const criterion = requiredAt(criteria, criterionIndex, 'topsis_criterion_missing')
    const column = rows.map((row) => requiredAt(row.values, criterionIndex, `topsis_value_missing:${criterion.id}`))
    const min = Math.min(...column)
    const max = Math.max(...column)
    const range = max - min
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const raw = requiredAt(column, rowIndex, `topsis_column_value_missing:${criterion.id}`)
      const normalizedRow = requiredAt(normalized, rowIndex, 'topsis_normalized_row_missing')
      normalizedRow[criterionIndex] = range === 0
        ? 1
        : criterion.sense === 'cost'
          ? (max - raw) / range
          : (raw - min) / range
    }
  }

  const weighted = normalized.map((row) => row.map((value, criterionIndex) => value * requiredAt(criteria, criterionIndex, 'topsis_criterion_missing').weight))
  const positiveIdealSolution = criteria.map((_, criterionIndex) => Math.max(...weighted.map((row) => requiredAt(row, criterionIndex, 'topsis_weighted_value_missing'))))
  const negativeIdealSolution = criteria.map((_, criterionIndex) => Math.min(...weighted.map((row) => requiredAt(row, criterionIndex, 'topsis_weighted_value_missing'))))

  const scored = rows.map((row, rowIndex) => {
    const weightedRow = requiredAt(weighted, rowIndex, 'topsis_weighted_row_missing')
    const normalizedRow = requiredAt(normalized, rowIndex, 'topsis_normalized_row_missing')
    const criteriaContributions = criteria.map((criterion, criterionIndex) => {
      const weightedValue = requiredAt(weightedRow, criterionIndex, 'topsis_weighted_value_missing')
      const positiveIdealValue = requiredAt(positiveIdealSolution, criterionIndex, 'topsis_positive_ideal_value_missing')
      const negativeIdealValue = requiredAt(negativeIdealSolution, criterionIndex, 'topsis_negative_ideal_value_missing')
      const pisDelta = weightedValue - positiveIdealValue
      const nisDelta = weightedValue - negativeIdealValue
      return {
        criterionId: criterion.id,
        raw: requiredAt(row.values, criterionIndex, `topsis_value_missing:${criterion.id}`),
        normalized: requiredAt(normalizedRow, criterionIndex, 'topsis_normalized_value_missing'),
        weight: criterion.weight,
        weighted: weightedValue,
        pisDelta,
        nisDelta,
        pisSquaredDistanceContribution: pisDelta ** 2,
        nisSquaredDistanceContribution: nisDelta ** 2,
      }
    })
    const pisDistanceSquared = criteriaContributions.reduce((sum, contribution) => sum + contribution.pisSquaredDistanceContribution, 0)
    const nisDistanceSquared = criteriaContributions.reduce((sum, contribution) => sum + contribution.nisSquaredDistanceContribution, 0)
    const pisDistance = Math.sqrt(pisDistanceSquared)
    const nisDistance = Math.sqrt(nisDistanceSquared)
    const denominator = nisDistance + pisDistance
    return {
      alternativeId: row.alternativeId,
      ...(row.label === undefined ? {} : { label: row.label }),
      criteria: criteriaContributions,
      pisDistanceSquared,
      nisDistanceSquared,
      pisDistance,
      nisDistance,
      closeness: nisDistance / denominator,
      rank: 0,
    }
  })

  const order = [...scored].sort((left, right) => right.closeness - left.closeness)
  const rankById = new Map(order.map((alternative, index) => [alternative.alternativeId, index + 1]))
  const alternatives = scored.map((alternative) => {
    const rank = rankById.get(alternative.alternativeId)
    if (rank === undefined) throw new Error(`topsis_rank_missing:${alternative.alternativeId}`)
    return {
      ...alternative,
      rank,
    }
  })
  const winner = order[0]
  if (winner === undefined) throw new Error('topsis_winner_missing')

  return {
    criteria,
    positiveIdealSolution,
    negativeIdealSolution,
    alternatives,
    winnerId: winner.alternativeId,
  }
}

function readAlternativeValue(
  alternative: TopsisAlternativeInput,
  criterionId: string,
  criterionIndex: number,
): number {
  const value = Array.isArray(alternative.values)
    ? alternative.values[criterionIndex]
    : (alternative.values as Readonly<Record<string, number>>)[criterionId]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`topsis_value_invalid:${criterionId}`)
  }
  return value
}
