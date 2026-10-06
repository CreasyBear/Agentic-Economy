import { canonicalDigest } from '@/modules/common/canonical-digest'

export function digestReference(kind: string, reference: unknown): string {
  return digestValue('account-segment', { kind, reference })
}

export function digestValue(kind: string, value: unknown): string {
  return stripDigest(canonicalDigest({ format: `ae.formance-${kind}:v1`, value }))
}

export function stripDigest(value: string): string {
  return value.slice('sha256:'.length)
}

type PlanHoldIdentity = Readonly<{ planRef: string; planDigest: string; accountRef: string }>

export function planHoldAccountAddress(input: PlanHoldIdentity): string {
  return `plans:${digestReference('plan_hold', {
    planRef: input.planRef, planDigest: input.planDigest, accountRef: input.accountRef,
  })}:hold`
}

export function planPromotionalHoldAccountAddress(input: PlanHoldIdentity, grantRef: string): string {
  return `plans:${digestReference('plan_promotional_hold', {
    planRef: input.planRef, planDigest: input.planDigest, accountRef: input.accountRef, grantRef,
  })}:hold`
}
