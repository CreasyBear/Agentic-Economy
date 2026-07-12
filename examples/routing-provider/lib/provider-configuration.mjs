const IDENTIFIER_MAX_LENGTH = 200

export function loadShippoConfiguration(env) {
  return Object.freeze({
    provider: 'shippo',
    providerToken: requiredSecret(env, 'AE_PROVIDER_TOKEN', 32),
    observabilityKey: requiredSecret(env, 'AE_PROVIDER_OBSERVABILITY_KEY', 32),
    token: requiredSecret(env, 'SHIPPO_API_TOKEN'),
    signingKey: requiredSecret(env, 'AE_PROVIDER_QUOTE_SIGNING_KEY', 32),
    carrierAccountId: requiredIdentifier(env, 'SHIPPO_CARRIER_ACCOUNT_ID'),
    serviceLevelToken: requiredIdentifier(env, 'SHIPPO_SERVICE_LEVEL_TOKEN'),
    shipmentTemplate: shippoShipment(requiredObjectJson(env, 'SHIPPO_TRACER_SHIPMENT_JSON')),
  })
}

export function loadEasyPostConfiguration(env) {
  return Object.freeze({
    provider: 'easypost',
    providerToken: requiredSecret(env, 'AE_PROVIDER_TOKEN', 32),
    observabilityKey: requiredSecret(env, 'AE_PROVIDER_OBSERVABILITY_KEY', 32),
    apiKey: requiredSecret(env, 'EASYPOST_API_KEY'),
    signingKey: requiredSecret(env, 'AE_PROVIDER_QUOTE_SIGNING_KEY', 32),
    carrierAccountId: requiredIdentifier(env, 'EASYPOST_CARRIER_ACCOUNT_ID'),
    service: requiredIdentifier(env, 'EASYPOST_SERVICE'),
    shipmentTemplate: easyPostShipment(requiredObjectJson(env, 'EASYPOST_TRACER_SHIPMENT_JSON')),
  })
}

export function providerReadinessInventory(env) {
  return Object.freeze({
    schemaVersion: 'ae-provider-readiness:v1',
    shippo: readiness(() => loadShippoConfiguration(env), [
      'AE_PROVIDER_TOKEN', 'AE_PROVIDER_OBSERVABILITY_KEY', 'SHIPPO_API_TOKEN', 'AE_PROVIDER_QUOTE_SIGNING_KEY', 'SHIPPO_CARRIER_ACCOUNT_ID',
      'SHIPPO_SERVICE_LEVEL_TOKEN', 'SHIPPO_TRACER_SHIPMENT_JSON',
    ], env),
    easypost: readiness(() => loadEasyPostConfiguration(env), [
      'AE_PROVIDER_TOKEN', 'AE_PROVIDER_OBSERVABILITY_KEY', 'EASYPOST_API_KEY', 'AE_PROVIDER_QUOTE_SIGNING_KEY', 'EASYPOST_CARRIER_ACCOUNT_ID',
      'EASYPOST_SERVICE', 'EASYPOST_TRACER_SHIPMENT_JSON',
    ], env),
  })
}

function readiness(load, fields, env) {
  let status = 'configured'
  let reason
  try { load() } catch (error) {
    status = fields.every((field) => configured(env[field])) ? 'invalid' : 'unconfigured'
    reason = safeConfigurationReason(error)
  }
  return Object.freeze({
    status,
    evidenceClass: 'local_configuration_only',
    liveReachability: 'unverified',
    checks: Object.freeze(Object.fromEntries(fields.map((field) => [field, configured(env[field]) ? 'present' : 'missing']))),
    ...(reason === undefined ? {} : { reason }),
  })
}

function requiredSecret(env, name, minimumLength = 8) {
  const value = env[name]
  if (typeof value !== 'string' || value.trim().length < minimumLength) throw new Error(`${name}_invalid`)
  return value
}

function requiredIdentifier(env, name) {
  const value = env[name]
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > IDENTIFIER_MAX_LENGTH) throw new Error(`${name}_invalid`)
  return value.trim()
}

function requiredObjectJson(env, name) {
  let value
  try { value = JSON.parse(requiredSecret(env, name)) } catch { throw new Error(`${name}_invalid`) }
  if (!plainObject(value)) throw new Error(`${name}_invalid`)
  return value
}

function shippoShipment(value) {
  if (!plainObject(value.address_from) || !plainObject(value.address_to)
    || !Array.isArray(value.parcels) || value.parcels.length !== 1 || !plainObject(value.parcels[0])) {
    throw new Error('SHIPPO_TRACER_SHIPMENT_JSON_invalid')
  }
  return deepFreeze({
    address_from: tracerAddress(value.address_from, 'SHIPPO_TRACER_SHIPMENT_JSON'),
    address_to: tracerAddress(value.address_to, 'SHIPPO_TRACER_SHIPMENT_JSON'),
    parcels: [tracerParcel(value.parcels[0], 'SHIPPO_TRACER_SHIPMENT_JSON')],
  })
}

function easyPostShipment(value) {
  if (!plainObject(value.from_address) || !plainObject(value.to_address) || !plainObject(value.parcel)) {
    throw new Error('EASYPOST_TRACER_SHIPMENT_JSON_invalid')
  }
  return deepFreeze({
    from_address: tracerAddress(value.from_address, 'EASYPOST_TRACER_SHIPMENT_JSON'),
    to_address: tracerAddress(value.to_address, 'EASYPOST_TRACER_SHIPMENT_JSON'),
    parcel: tracerParcel(value.parcel, 'EASYPOST_TRACER_SHIPMENT_JSON'),
  })
}

function tracerAddress(value, reasonPrefix) {
  const required = ['name', 'street1', 'city', 'state', 'zip', 'country']
  const optional = ['company', 'street2', 'phone', 'email']
  if (!onlyKeys(value, [...required, ...optional])) throw new Error(`${reasonPrefix}_invalid`)
  const normalized = Object.fromEntries(required.map((key) => [key, boundedText(value[key], 1, key === 'country' ? 2 : 200, reasonPrefix)]))
  if (normalized.country !== 'AU') throw new Error(`${reasonPrefix}_invalid`)
  for (const key of optional) if (value[key] !== undefined) normalized[key] = boundedText(value[key], 1, 200, reasonPrefix)
  return normalized
}

function tracerParcel(value, reasonPrefix) {
  const keys = ['length', 'width', 'height', 'distance_unit', 'weight', 'mass_unit']
  if (!onlyKeys(value, keys)) throw new Error(`${reasonPrefix}_invalid`)
  const distanceUnit = boundedText(value.distance_unit, 1, 10, reasonPrefix)
  const massUnit = boundedText(value.mass_unit, 1, 10, reasonPrefix)
  if (!['cm', 'in'].includes(distanceUnit) || !['g', 'kg', 'oz', 'lb'].includes(massUnit)) throw new Error(`${reasonPrefix}_invalid`)
  return {
    length: positiveDecimal(value.length, reasonPrefix), width: positiveDecimal(value.width, reasonPrefix),
    height: positiveDecimal(value.height, reasonPrefix), distance_unit: distanceUnit,
    weight: positiveDecimal(value.weight, reasonPrefix), mass_unit: massUnit,
  }
}

function positiveDecimal(value, reasonPrefix) {
  const text = typeof value === 'number' ? String(value) : value
  if (typeof text !== 'string' || !/^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/.test(text) || text.length > 20) {
    throw new Error(`${reasonPrefix}_invalid`)
  }
  return text
}

function boundedText(value, minimum, maximum, reasonPrefix) {
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum) throw new Error(`${reasonPrefix}_invalid`)
  return value.trim()
}

function onlyKeys(value, allowed) { return Object.keys(value).every((key) => allowed.includes(key)) }
function deepFreeze(value) {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function plainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function configured(value) { return typeof value === 'string' && value.trim().length > 0 }
function safeConfigurationReason(error) {
  const reason = error instanceof Error ? error.message : 'provider_configuration_invalid'
  return /^[A-Z0-9_]+_invalid$/.test(reason) ? reason : 'provider_configuration_invalid'
}
