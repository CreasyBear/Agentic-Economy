import { isRecord } from '@/modules/common/is-record'
import {
  validateDiscoveryExtension,
  validateDiscoveryExtensionSpec,
  validateRouteTemplate,
  type DiscoveryExtension,
} from '@x402/extensions/bazaar'

import {
  admitBazaarDiscoveryInfo,
  type BazaarAdmission,
} from './publication-importer-x402-bazaar'
import { degradeBackend } from '@/lib/observability/degrade-backend'

function isDiscoveryExtension(
  value: unknown,
): value is DiscoveryExtension {
  if (!isRecord(value)) return false
  if (!isRecord(value.info) || !isRecord(value.schema)) return false
  const input = value.info.input
  if (!isRecord(input)) return false
  return input.type === 'http' || input.type === 'mcp'
}

export function admitOfficialBazaarFromPaymentRequired(
  paymentRequired: Readonly<Record<string, unknown>>,
): BazaarAdmission {
  const extensions = paymentRequired.extensions
  const extension = isRecord(extensions) ? extensions.bazaar : undefined
  if (extension === undefined) {
    return { kind: 'absent' }
  }
  if (!isRecord(extension)) {
    return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
  }
  try {
    const validation = validateDiscoveryExtensionSpec(extension)
    if (!validation.valid) {
      return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
    }
    if (extension.routeTemplate !== undefined
      && (typeof extension.routeTemplate !== 'string' || validateRouteTemplate(extension.routeTemplate) === undefined)) {
      return { kind: 'refused', reason: 'transport_unsupported' }
    }
    if (!isDiscoveryExtension(extension)) {
      return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
    }
    const info = isRecord(extension.info) ? extension.info : undefined
    if (info === undefined || !isRecord(info.input)) {
      return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
    }
    // CDP emits an empty body when no example is known. Its absence must not
    // make a richer declared request schema uncallable: validate the actual
    // customer request at Quote time. Concrete supplied examples still need
    // to agree with the official declaration.
    const example = info.input.type === 'http'
      ? ('queryParams' in info.input ? info.input.queryParams : 'body' in info.input ? info.input.body : undefined)
      : undefined
    if (isRecord(example) && Object.keys(example).length > 0) {
      const consistency = validateDiscoveryExtension(extension)
      if (!consistency.valid) return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
    }
    return admitBazaarDiscoveryInfo(extension, { input: info.input, output: info.output })
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused', reason: 'bazaar_discovery_invalid' } as const, { site: 'admitOfficialBazaarFromPaymentRequired', reason: 'invalid_response' })
  }
}
