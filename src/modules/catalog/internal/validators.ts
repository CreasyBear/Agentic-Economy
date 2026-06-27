import { z } from 'zod'

import {
  BusinessServiceStatusValues,
  CapabilityKindValues,
  FirstRequestModeValues,
  PublicFirstRequestChannelValues,
  ServiceCapabilityStatusValues,
} from '@/modules/catalog/public'

export const FirstRequestModeSchema = z.enum(FirstRequestModeValues)
export const PublicFirstRequestChannelSchema = z.enum(PublicFirstRequestChannelValues)
export const ServiceCapabilityStatusSchema = z.enum(ServiceCapabilityStatusValues)
export const CapabilityKindSchema = z.enum(CapabilityKindValues)
export const BusinessServiceStatusSchema = z.enum(BusinessServiceStatusValues)
