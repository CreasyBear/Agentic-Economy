import { z } from 'zod'

const AeSearchModeValues = ['near_me', 'whole_catalogue'] as const
export type AeSearchMode = (typeof AeSearchModeValues)[number]
export const NeedTimingValues = ['today', 'this_week', 'flexible', 'date'] as const
export type NeedTiming = (typeof NeedTimingValues)[number]


const AeSearchLocationSourceValues = [
  'default',
  'user_selected',
  'browser_permission',
  'saved',
] as const
export type AeSearchLocationSource = (typeof AeSearchLocationSourceValues)[number]

const AeSearchLocationSchema = z.object({
  label: z.string().trim().min(1).max(80),
  suburb: z.string().trim().min(1).max(80).optional(),
  stateTerritory: z.string().trim().min(2).max(3).optional(),
  countryCode: z.string().length(2).optional(),
  source: z.enum(AeSearchLocationSourceValues),
})

export const AeSearchContextSchema = z.object({
  mode: z.enum(AeSearchModeValues),
  location: AeSearchLocationSchema.optional(),
  allowOutsideArea: z.boolean().optional(),
  timing: z.enum(NeedTimingValues).optional(),
  timingDate: z.iso.date().optional(),
}).refine((context) => context.timing === 'date' ? context.timingDate !== undefined : context.timingDate === undefined, {
  message: 'A timing date is required only for date timing.',
  path: ['timingDate'],
})

export type AeSearchContext = z.infer<typeof AeSearchContextSchema>

export const DEFAULT_AE_SEARCH_CONTEXT: AeSearchContext = {
  mode: 'whole_catalogue',
}

export function aeSearchContextLocationLabel(context: AeSearchContext | undefined): string | undefined {
  const label = context?.location?.label.trim()
  return label === undefined || label.length === 0 ? undefined : label
}

export function aeSearchContextLocationQuery(context: AeSearchContext | undefined): string | undefined {
  if (context?.mode !== 'near_me' || context.allowOutsideArea === true) {
    return undefined
  }

  const suburb = context.location?.suburb?.trim()
  if (suburb !== undefined && suburb.length > 0) {
    return suburb
  }

  return aeSearchContextLocationLabel(context)
}

export function stableAeSearchContextKey(context: AeSearchContext | undefined): string {
  if (context === undefined) {
    return 'none'
  }

  return JSON.stringify({
    mode: context.mode,
    allowOutsideArea: context.allowOutsideArea === true,
    location: context.location === undefined
      ? null
      : {
          label: context.location.label,
          suburb: context.location.suburb,
          stateTerritory: context.location.stateTerritory,
          countryCode: context.location.countryCode,
          source: context.location.source,
        },
    timing: context.timing,
    timingDate: context.timingDate,
  })
}
