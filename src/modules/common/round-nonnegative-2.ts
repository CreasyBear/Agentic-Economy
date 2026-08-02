import { round2 } from './round-2'

export function roundNonNegative2(value: number): number {
  return Math.max(0, round2(value))
}

export function roundFiniteNonNegative2(value: number): number {
  return Number.isFinite(value) ? roundNonNegative2(value) : 0
}
