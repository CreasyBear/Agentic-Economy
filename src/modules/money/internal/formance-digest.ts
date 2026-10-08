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

export function formanceReference(commandIdentity: unknown, suffix: string): string {
  return `ae-p4:${digestValue('transaction-reference', commandIdentity)}:${suffix}`
}

/** Original buyer-sale identity, shared by the native writer and admission readback. */
export function managedCallBuyerSaleReference(input: { callRef: string; quoteRef: string }): string {
  return formanceReference({ callRef: input.callRef, quoteRef: input.quoteRef, stage: 'settle-buyer' }, 'settle-buyer')
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
