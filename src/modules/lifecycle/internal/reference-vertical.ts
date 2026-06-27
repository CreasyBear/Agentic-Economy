import type { LifecycleDescriptor } from '@/modules/lifecycle/public'

export const urgentTradeServiceDescriptor = {
  lifecycleClass: 'urgent_trade_service',
  descriptorOnly: true,
  primitives: {
    held_money: true,
    external_authority: true,
    time_bound: true,
    proof_gap: true,
  },
  publicSummary: 'Urgent local services depend on availability, evidence, and external follow-through.',
  evidencePosture: 'owner_declared',
} satisfies LifecycleDescriptor
