import { z } from 'zod'

import { LifecycleClassValues, LifecyclePrimitiveValues } from '@/modules/lifecycle/public'

export const LifecyclePrimitiveSchema = z.enum(LifecyclePrimitiveValues)
export const LifecycleClassSchema = z.enum(LifecycleClassValues)
