import { z } from 'zod'

import {
  IndexStatusValues,
  IndexTargetTypeValues,
  RegistryProjectionKindValues,
  RegistryProjectionStatusValues,
} from '@/modules/registry/public'

export const IndexStatusSchema = z.enum(IndexStatusValues)
export const RegistryProjectionStatusSchema = z.enum(RegistryProjectionStatusValues)
export const RegistryProjectionKindSchema = z.enum(RegistryProjectionKindValues)
export const IndexTargetTypeSchema = z.enum(IndexTargetTypeValues)
