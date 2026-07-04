import { z } from 'zod'

export const AeSearchModeValues = ['near_me', 'whole_catalogue'] as const
export type AeSearchMode = (typeof AeSearchModeValues)[number]

export const AeSearchLocationSourceValues = [
  'default',
  'user_selected',
  'browser_permission',
  'saved',
] as const
export type AeSearchLocationSource = (typeof AeSearchLocationSourceValues)[number]

export const AeSearchLocationSchema = z.object({
  label: z.string().trim().min(1).max(80),
  suburb: z.string().trim().min(1).max(80).optional(),
  stateTerritory: z.string().trim().min(2).max(3).optional(),
  countryCode: z.literal('AU').default('AU'),
  source: z.enum(AeSearchLocationSourceValues),
})

export const AeSearchContextSchema = z.object({
  mode: z.enum(AeSearchModeValues),
  location: AeSearchLocationSchema.optional(),
  allowOutsideArea: z.boolean().optional(),
})

export type AeSearchContext = z.infer<typeof AeSearchContextSchema>

export const DEFAULT_AE_SEARCH_CONTEXT: AeSearchContext = {
  mode: 'near_me',
  allowOutsideArea: false,
  location: {
    label: 'Perth, WA',
    suburb: 'Perth',
    stateTerritory: 'WA',
    countryCode: 'AU',
    source: 'default',
  },
}

export function normalizeAeSearchContext(value: unknown): AeSearchContext | undefined {
  const parsed = AeSearchContextSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
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

export function buildAeSearchContextFromLabel(
  label: string,
  source: AeSearchLocationSource = 'user_selected',
): AeSearchContext {
  const trimmed = label.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (trimmed.length === 0) {
    return {
      mode: 'whole_catalogue',
      allowOutsideArea: true,
    }
  }

  return {
    mode: 'near_me',
    allowOutsideArea: false,
    location: {
      label: trimmed,
      ...parseAustralianPlaceLabel(trimmed),
      countryCode: 'AU',
      source,
    },
  }
}

export function aeSearchContextWithMode(
  context: AeSearchContext,
  mode: AeSearchMode,
): AeSearchContext {
  if (mode === 'whole_catalogue') {
    return {
      ...context,
      mode,
      allowOutsideArea: true,
    }
  }

  return {
    ...context,
    mode,
    allowOutsideArea: false,
    location: context.location ?? DEFAULT_AE_SEARCH_CONTEXT.location,
  }
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
  })
}

function parseAustralianPlaceLabel(label: string): { suburb?: string; stateTerritory?: string } {
  const parts = label.split(',').flatMap((part) => {
    const trimmed = part.trim()
    return trimmed ? [trimmed] : []
  })
  const suburb = parts[0]
  const stateCandidate = parts[1]?.toUpperCase()
  const stateTerritory =
    stateCandidate !== undefined && /^(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)$/.test(stateCandidate)
      ? stateCandidate
      : undefined

  return {
    ...(suburb === undefined || suburb.length === 0 ? {} : { suburb }),
    ...(stateTerritory === undefined ? {} : { stateTerritory }),
  }
}
