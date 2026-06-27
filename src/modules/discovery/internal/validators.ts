import { z } from 'zod'

import { DiscoveryAttemptStatusValues, DiscoveryPathKindValues, DiscoveryStatusValues } from '@/modules/discovery/public'

export const DiscoveryStatusSchema = z.enum(DiscoveryStatusValues)
export const DiscoveryPathKindSchema = z.enum(DiscoveryPathKindValues)
export const DiscoveryAttemptStatusSchema = z.enum(DiscoveryAttemptStatusValues)
