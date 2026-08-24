import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import type { PublicStatus } from '@/modules/business/public'
import { PublicStatusValues, TrustTierValues } from '@/modules/business/public'
import type { BusinessOfferingStatus, OfferingAccessPathStatus } from '@/modules/catalog/public'
import { BusinessOfferingStatusValues, OfferingAccessPathStatusValues } from '@/modules/catalog/public'
import type { AdminRole } from '@/modules/security/public'
import { AdminRoleSchema } from '@/modules/security/internal/validators'
import type {
  CurrentOperationAuditEventType,
  CurrentOperationAuditTargetType,
  FunnelEventType,
} from '@/modules/observability/public'
import {
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
} from '@/modules/observability/public'
import {
  AuditEventTypeSchema,
  AuditTargetTypeSchema,
  FunnelEventTypeSchema,
} from '@/modules/observability/internal/validators'

const BusinessOfferingStatusSchema = z.enum(BusinessOfferingStatusValues)
const OfferingAccessPathStatusSchema = z.enum(OfferingAccessPathStatusValues)

describe('domain-owned state contracts', () => {
  it('keeps validators equal to exported domain unions', () => {
    expectTypeOf<z.infer<typeof BusinessOfferingStatusSchema>>().toEqualTypeOf<BusinessOfferingStatus>()
    expectTypeOf<z.infer<typeof OfferingAccessPathStatusSchema>>().toEqualTypeOf<OfferingAccessPathStatus>()
    expectTypeOf<z.infer<typeof AdminRoleSchema>>().toEqualTypeOf<AdminRole>()
    expectTypeOf<z.infer<typeof AuditEventTypeSchema>>().toEqualTypeOf<CurrentOperationAuditEventType>()
    expectTypeOf<z.infer<typeof AuditTargetTypeSchema>>().toEqualTypeOf<CurrentOperationAuditTargetType>()
    expectTypeOf<z.infer<typeof FunnelEventTypeSchema>>().toEqualTypeOf<FunnelEventType>()
    expectTypeOf<(typeof AuditTargetTypeValues)[number]>().toEqualTypeOf<CurrentOperationAuditTargetType>()
    expectTypeOf<(typeof FunnelEventTypeValues)[number]>().toEqualTypeOf<FunnelEventType>()
    expectTypeOf<(typeof AuditEventTypeValues)[number]>().toEqualTypeOf<CurrentOperationAuditEventType>()
  })

  it('rejects invalid status strings at runtime', () => {
    expect(BusinessOfferingStatusSchema.safeParse('live').success).toBe(false)
    expect(OfferingAccessPathStatusSchema.safeParse('active').success).toBe(false)
  })

  it('accepts representative observability literals at runtime', () => {
    expect(AuditEventTypeSchema.parse('billing.provider_event_held')).toBe('billing.provider_event_held')
    expect(AuditTargetTypeSchema.parse('protected_action_attempt')).toBe('protected_action_attempt')
    expect(FunnelEventTypeSchema.parse('paid_activation_started')).toBe('paid_activation_started')
  })

  it('keeps authority state values exact', () => {
    expect(PublicStatusValues).toEqual(['unpublished', 'published', 'suppressed'])
    expect(TrustTierValues).toEqual(['claimed', 'contact_confirmed', 'listed', 'registry_verified'])
  })
})

// @ts-expect-error broad live state is not a valid public status
const invalidPublicStatus: PublicStatus = 'live'
void invalidPublicStatus

// @ts-expect-error broad strings cannot stand in for exact event types
const invalidAuditEvent: CurrentOperationAuditEventType = 'admin.changed'
void invalidAuditEvent
