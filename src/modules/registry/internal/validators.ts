import { z } from 'zod'

import {
  IndexStatusValues,
  IndexTargetTypeValues,
  RegistryProjectionKindValues,
  RegistryProjectionStatusValues,
  RegistryRepairActionValues,
  RegistryRepairResultValues,
} from '@/modules/registry/public'

export const IndexStatusSchema = z.enum(IndexStatusValues)
export const RegistryProjectionStatusSchema = z.enum(RegistryProjectionStatusValues)
export const RegistryProjectionKindSchema = z.enum(RegistryProjectionKindValues)
export const IndexTargetTypeSchema = z.enum(IndexTargetTypeValues)
export const RegistryRepairActionSchema = z.enum(RegistryRepairActionValues)
export const RegistryRepairResultSchema = z.enum(RegistryRepairResultValues)
