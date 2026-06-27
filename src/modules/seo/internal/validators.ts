import { z } from 'zod'

import { SeoIndexDirectiveValues } from '@/modules/seo/public'

export const SeoIndexDirectiveSchema = z.enum(SeoIndexDirectiveValues)
