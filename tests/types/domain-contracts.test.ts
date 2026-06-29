import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import type { ClaimStatus, PublicStatus, TrustTier } from '@/modules/business/public'
import { ClaimStatusValues, PublicStatusValues, TrustTierValues } from '@/modules/business/public'
import { ClaimStatusSchema, PublicStatusSchema, TrustTierSchema } from '@/modules/business/internal/validators'
import type { FirstRequestMode, ServiceCapabilityStatus } from '@/modules/catalog/public'
import { FirstRequestModeSchema, ServiceCapabilityStatusSchema } from '@/modules/catalog/internal/validators'
import type { DiscoveryStatus } from '@/modules/discovery/public'
import { DiscoveryStatusSchema } from '@/modules/discovery/internal/validators'
import type { IndexStatus } from '@/modules/registry/public'
import { IndexStatusSchema } from '@/modules/registry/internal/validators'
import type { AdminRole } from '@/modules/security/public'
import { AdminRoleSchema } from '@/modules/security/internal/validators'
import type { AuditEventType, AuditTargetType, FunnelEventType, OperatorControlKey } from '@/modules/observability/public'
import {
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
  OperatorControlKeyValues,
} from '@/modules/observability/public'
import {
  AuditEventTypeSchema,
  AuditTargetTypeSchema,
  FunnelEventTypeSchema,
  OperatorControlKeySchema,
} from '@/modules/observability/internal/validators'

describe('domain-owned state contracts', () => {
  it('keeps validators equal to exported domain unions', () => {
    expectTypeOf<z.infer<typeof ClaimStatusSchema>>().toEqualTypeOf<ClaimStatus>()
    expectTypeOf<z.infer<typeof PublicStatusSchema>>().toEqualTypeOf<PublicStatus>()
    expectTypeOf<z.infer<typeof TrustTierSchema>>().toEqualTypeOf<TrustTier>()
    expectTypeOf<z.infer<typeof FirstRequestModeSchema>>().toEqualTypeOf<FirstRequestMode>()
    expectTypeOf<z.infer<typeof ServiceCapabilityStatusSchema>>().toEqualTypeOf<ServiceCapabilityStatus>()
    expectTypeOf<z.infer<typeof DiscoveryStatusSchema>>().toEqualTypeOf<DiscoveryStatus>()
    expectTypeOf<z.infer<typeof IndexStatusSchema>>().toEqualTypeOf<IndexStatus>()
    expectTypeOf<z.infer<typeof AdminRoleSchema>>().toEqualTypeOf<AdminRole>()
    expectTypeOf<z.infer<typeof AuditEventTypeSchema>>().toEqualTypeOf<AuditEventType>()
    expectTypeOf<z.infer<typeof OperatorControlKeySchema>>().toEqualTypeOf<OperatorControlKey>()
    expectTypeOf<z.infer<typeof AuditTargetTypeSchema>>().toEqualTypeOf<AuditTargetType>()
    expectTypeOf<z.infer<typeof FunnelEventTypeSchema>>().toEqualTypeOf<FunnelEventType>()
    expectTypeOf<(typeof AuditTargetTypeValues)[number]>().toEqualTypeOf<AuditTargetType>()
    expectTypeOf<(typeof FunnelEventTypeValues)[number]>().toEqualTypeOf<FunnelEventType>()
    expectTypeOf<(typeof OperatorControlKeyValues)[number]>().toEqualTypeOf<OperatorControlKey>()
    expectTypeOf<(typeof AuditEventTypeValues)[number]>().toEqualTypeOf<AuditEventType>()
  })

  it('rejects invalid status strings at runtime', () => {
    expect(ClaimStatusSchema.safeParse('active').success).toBe(false)
    expect(PublicStatusSchema.safeParse('live').success).toBe(false)
    expect(IndexStatusSchema.safeParse('ready').success).toBe(false)
  })

  it('accepts representative P2-P5 observability substrate literals at runtime', () => {
    expect(AuditEventTypeSchema.parse('notification.webhook_held')).toBe('notification.webhook_held')
    expect(AuditEventTypeSchema.parse('billing.provider_event_held')).toBe('billing.provider_event_held')
    expect(AuditTargetTypeSchema.parse('protected_action_attempt')).toBe('protected_action_attempt')
    expect(FunnelEventTypeSchema.parse('paid_activation_started')).toBe('paid_activation_started')
    expect(OperatorControlKeySchema.parse('billing_reconciliation_enabled')).toBe('billing_reconciliation_enabled')
  })

  it('keeps authority state values exact', () => {
    expect(ClaimStatusValues).toEqual(['draft', 'authenticated', 'published', 'contested', 'disputed', 'suppressed'])
    expect(PublicStatusValues).toEqual(['unpublished', 'published', 'suppressed'])
    expect(TrustTierValues).toEqual(['claimed', 'contact_confirmed', 'listed', 'registry_verified'])
  })
})

// @ts-expect-error broad live state is not a valid public status
const invalidPublicStatus: PublicStatus = 'live'
void invalidPublicStatus

// @ts-expect-error broad strings cannot stand in for exact event types
const invalidAuditEvent: AuditEventType = 'admin.changed'
void invalidAuditEvent
