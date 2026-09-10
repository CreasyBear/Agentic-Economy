import { z } from 'zod'

export const AdminRoleValues = ['owner_admin', 'support', 'reviewer'] as const

export const AdminRoleSchema = z.enum(AdminRoleValues)
