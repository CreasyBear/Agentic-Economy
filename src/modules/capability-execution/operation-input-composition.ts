import { isRecord } from '@/modules/common/is-record'
import { validateJsonSchema } from '@/modules/capability-contract/public'
import type { KeylessExecutableToolDescriptor } from './operation-execute.actions'

/**
 * A kernel-owned input mapping between two already-admitted keyless operations.
 * The model may select the destination operation, but it never invents the
 * source operation, output pointers, or defaults in this table.
 */
export type KeylessOperationCompositionMapping = Readonly<{
  sourceCapabilityId: string
  targetCapabilityId: string
  sourceInputKey: string
  latitudeInputKey: string
  longitudeInputKey: string
}>

/** The only answer-path composition currently admitted by the kernel. */
export const KEYLESS_OPERATION_COMPOSITION_MAPPINGS: readonly KeylessOperationCompositionMapping[] = Object.freeze([
  Object.freeze({
    sourceCapabilityId: 'open-meteo.geocoding',
    targetCapabilityId: 'open-meteo.forecast',
    sourceInputKey: 'name',
    latitudeInputKey: 'latitude',
    longitudeInputKey: 'longitude',
  }),
])

export type KeylessOperationCompositionPlan = Readonly<{
  mapping: KeylessOperationCompositionMapping
  sourceDescriptor: KeylessExecutableToolDescriptor
  targetDescriptor: KeylessExecutableToolDescriptor
  sourceInput: Readonly<Record<string, unknown>>
  targetInputDefaults: Readonly<Record<string, unknown>>
  place: string
}>

/**
 * Returns a composition plan only for a registered mapping and a supplied
 * place. Numeric coordinates remain a direct destination operation: callers
 * should invoke this helper only when they need place-to-coordinate input.
 */
export function planKeylessOperationComposition(input: Readonly<{
  place: string | undefined
  targetDescriptor: KeylessExecutableToolDescriptor | undefined
  descriptors: readonly KeylessExecutableToolDescriptor[]
  targetInput: Record<string, unknown>
}>): KeylessOperationCompositionPlan | undefined {
  const place = input.place?.trim()
  const target = input.targetDescriptor
  if (place === undefined || place.length === 0 || target === undefined) return undefined

  const mapping = KEYLESS_OPERATION_COMPOSITION_MAPPINGS.find((candidate) => (
    candidate.targetCapabilityId === target.capabilityId
  ))
  if (mapping === undefined) return undefined

  const source = input.descriptors.find((candidate) => (
    candidate.capabilityId === mapping.sourceCapabilityId
  ))
  if (source === undefined) return undefined

  const sourceInput = { [mapping.sourceInputKey]: place }

  return Object.freeze({
    mapping,
    sourceDescriptor: source,
    targetDescriptor: target,
    sourceInput: Object.freeze(sourceInput),
    targetInputDefaults: Object.freeze(applyDescriptorDefaults(target.inputSchema, input.targetInput)),
    place,
  })
}

/**
 * Applies only defaults declared by the destination contract. In particular,
 * `current_weather: true` comes from the Open-Meteo descriptor, not from this
 * composition mapping or a query-specific branch.
 */
function applyDescriptorDefaults(
  schema: Record<string, unknown>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output = { ...input }
  const properties = isRecord(schema.properties) ? schema.properties : {}
  for (const [name, property] of Object.entries(properties)) {
    if (Object.prototype.hasOwnProperty.call(output, name)) continue
    if (isRecord(property) && property.default !== undefined) output[name] = property.default
  }
  return output
}

export type GeocodedCoordinates = Readonly<{
  latitude: number
  longitude: number
}>

/**
 * Selects the provider's first geocoding result after validating the exact
 * values the forecast contract can consume. Empty/malformed results fail
 * closed instead of fabricating coordinates or asking for a place again.
 */
export function readGeocodedCoordinates(
  result: unknown,
): GeocodedCoordinates | undefined {
  if (!isRecord(result) || !Array.isArray(result.results)) return undefined
  const first = result.results[0]
  if (!isRecord(first)) return undefined
  const latitude = first.latitude
  const longitude = first.longitude
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return undefined
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return undefined
  }
  return Object.freeze({ latitude, longitude })
}

/**
 * Builds the destination input from the geocoder result and re-validates it
 * against the destination descriptor before the executor is called.
 */
export function composeKeylessOperationInput(input: Readonly<{
  plan: KeylessOperationCompositionPlan
  coordinates: GeocodedCoordinates
}>): Readonly<Record<string, unknown>> | undefined {
  const targetInput = {
    ...input.plan.targetInputDefaults,
    [input.plan.mapping.latitudeInputKey]: input.coordinates.latitude,
    [input.plan.mapping.longitudeInputKey]: input.coordinates.longitude,
  }
  return validateJsonSchema(input.plan.targetDescriptor.inputSchema, targetInput)
    ? Object.freeze(targetInput)
    : undefined
}

/** Returns true when the request itself supplies a numeric coordinate pair. */
export function hasExplicitNumericCoordinates(query: string): boolean {
  const pair = query.match(/(?:^|\s)(-?\d+(?:\.\d+)?)\s*[,/]\s*(-?\d+(?:\.\d+)?)(?:\s|$)/u)
    ?? query.match(/\blat(?:itude)?\s*[:=]?\s*(-?\d+(?:\.\d+)?)[,\s]+(?:lon|longitude)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/iu)
  if (pair === null) return false
  const latitude = Number(pair[1])
  const longitude = Number(pair[2])
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
}
