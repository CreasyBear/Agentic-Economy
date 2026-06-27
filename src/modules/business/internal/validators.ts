import { z } from 'zod'

import { ClaimStatusValues, PublicStatusValues, TrustTierValues, VisibilityTargetTypeValues } from '@/modules/business/public'

export const ClaimStatusSchema = z.enum(ClaimStatusValues)
export const PublicStatusSchema = z.enum(PublicStatusValues)
export const TrustTierSchema = z.enum(TrustTierValues)
export const VisibilityTargetTypeSchema = z.enum(VisibilityTargetTypeValues)
