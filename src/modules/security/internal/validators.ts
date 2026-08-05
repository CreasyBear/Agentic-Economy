import { z } from 'zod'

import { AdminRoleValues } from '@/modules/security/public'

export const AdminRoleSchema = z.enum(AdminRoleValues)
