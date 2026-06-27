export const LifecyclePrimitiveValues = ['held_money', 'external_authority', 'time_bound', 'proof_gap'] as const
export type LifecyclePrimitive = (typeof LifecyclePrimitiveValues)[number]

export const LifecycleClassValues = ['urgent_trade_service'] as const
export type LifecycleClass = (typeof LifecycleClassValues)[number]

export type LifecycleDescriptor = {
  lifecycleClass: LifecycleClass
  descriptorOnly: true
  primitives: Readonly<Record<LifecyclePrimitive, true>>
  publicSummary: string
  evidencePosture: 'owner_declared' | 'source_verified' | 'not_supplied'
}
