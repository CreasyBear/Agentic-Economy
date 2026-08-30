import { InfisicalCloudSecretStore, type OidcIdentityTokenProvider } from './infisical-cloud'
import {
  SecretPlane,
  type SecretGenerationValidator,
  type SecretPlaneOptions,
  type SecretPointerStore,
} from './secret-plane'
import { VercelOidcIdentityTokenProvider } from './vercel-oidc'
import {
  createScopedSecretConsequenceRuntime,
  ProductionSecretGenerationValidator,
  type ScopedSecretConsequenceRuntime,
  type SecretGenerationProbe,
} from './production-consumer'

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/u
const VAULT_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/u
const CONFIGURATION_ERROR = 'Secret runtime configuration is invalid.'

export type SecretVaultScope = 'platform' | 'customer'

export interface InfisicalVaultConfiguration {
  readonly scope: SecretVaultScope
  readonly baseUrl: string
  readonly projectId: string
  readonly environment: string
  readonly secretPath: string
  readonly machineIdentityId: string
  readonly organizationSlug?: string
}

export interface SecretRuntimeConfiguration {
  readonly platform: InfisicalVaultConfiguration
  readonly customer: InfisicalVaultConfiguration
}

export interface ScopedSecretPlaneDependencies {
  readonly pointerStore: SecretPointerStore
  readonly validator: SecretGenerationValidator
  readonly randomUuid?: () => string
}

export interface InfisicalCloudSecretRuntimeOptions {
  readonly configuration: SecretRuntimeConfiguration
  readonly platform: ScopedSecretPlaneDependencies
  readonly customer: ScopedSecretPlaneDependencies
  readonly identityTokenProvider: OidcIdentityTokenProvider
  readonly fetch?: typeof fetch
  readonly now?: () => number
}

export interface ProductionScopedSecretPlaneDependencies {
  readonly pointerStore: SecretPointerStore
  readonly generationProbe: SecretGenerationProbe
  readonly randomUuid?: () => string
}

export interface ProductionSecretRuntimeOptions extends Omit<
  InfisicalCloudSecretRuntimeOptions,
  'identityTokenProvider' | 'platform' | 'customer'
> {
  readonly platform: ProductionScopedSecretPlaneDependencies
  readonly customer: ProductionScopedSecretPlaneDependencies
}

export interface ScopedSecretRuntime {
  readonly platform: SecretPlane
  readonly customer: SecretPlane
}

export interface ProductionSecretRuntime extends ScopedSecretRuntime {
  readonly consequences: ScopedSecretConsequenceRuntime
}

interface ValidatedVaultConfiguration extends InfisicalVaultConfiguration {
  readonly baseUrl: string
}

function configurationFailure(): TypeError {
  return new TypeError(CONFIGURATION_ERROR)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) throw configurationFailure()
  return value
}

function requireVaultPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.endsWith('/')) {
    throw configurationFailure()
  }
  const segments = value.slice(1).split('/')
  if (
    segments.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..' || !VAULT_PATH_SEGMENT_PATTERN.test(segment))
  ) {
    throw configurationFailure()
  }
  return value
}

function requireBaseUrl(value: unknown): string {
  if (typeof value !== 'string') throw configurationFailure()
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw configurationFailure()
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw configurationFailure()
  }
  return url.origin
}

function requireVaultConfiguration(value: unknown, scope: SecretVaultScope): ValidatedVaultConfiguration {
  if (!isRecord(value) || value.scope !== scope) throw configurationFailure()
  const organizationSlug = value.organizationSlug === undefined
    ? undefined
    : requireIdentifier(value.organizationSlug)
  return Object.freeze({
    scope,
    baseUrl: requireBaseUrl(value.baseUrl),
    projectId: requireIdentifier(value.projectId),
    environment: requireIdentifier(value.environment),
    secretPath: requireVaultPath(value.secretPath),
    machineIdentityId: requireIdentifier(value.machineIdentityId),
    ...(organizationSlug === undefined ? {} : { organizationSlug }),
  })
}

function requireRuntimeConfiguration(value: unknown): SecretRuntimeConfiguration {
  if (!isRecord(value)) throw configurationFailure()
  const platform = requireVaultConfiguration(value.platform, 'platform')
  const customer = requireVaultConfiguration(value.customer, 'customer')
  if (
    platform.baseUrl !== customer.baseUrl ||
    platform.projectId === customer.projectId ||
    platform.secretPath === customer.secretPath
  ) {
    throw configurationFailure()
  }
  return Object.freeze({ platform, customer })
}

export function createSecretRuntime(options: SecretPlaneOptions): SecretPlane {
  return new SecretPlane(options)
}

export function createInfisicalCloudSecretRuntime(
  options: InfisicalCloudSecretRuntimeOptions,
): ScopedSecretRuntime {
  const configuration = requireRuntimeConfiguration(options.configuration)
  const createScope = (
    vault: InfisicalVaultConfiguration,
    dependencies: ScopedSecretPlaneDependencies,
  ): SecretPlane => createSecretRuntime({
    store: new InfisicalCloudSecretStore({
      ...vault,
      identityTokenProvider: options.identityTokenProvider,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.now === undefined ? {} : { now: options.now }),
    }),
    ...dependencies,
  })

  return Object.freeze({
    platform: createScope(configuration.platform, options.platform),
    customer: createScope(configuration.customer, options.customer),
  })
}

export function createProductionSecretRuntime(
  options: ProductionSecretRuntimeOptions,
): ProductionSecretRuntime {
  const dependencies = (
    scoped: ProductionScopedSecretPlaneDependencies,
  ): ScopedSecretPlaneDependencies => ({
    pointerStore: scoped.pointerStore,
    validator: new ProductionSecretGenerationValidator(scoped.generationProbe),
    ...(scoped.randomUuid === undefined ? {} : { randomUuid: scoped.randomUuid }),
  })
  const runtime = createInfisicalCloudSecretRuntime({
    ...options,
    platform: dependencies(options.platform),
    customer: dependencies(options.customer),
    identityTokenProvider: new VercelOidcIdentityTokenProvider(
      options.now === undefined ? {} : { now: options.now },
    ),
  })
  return Object.freeze({
    ...runtime,
    consequences: createScopedSecretConsequenceRuntime(runtime),
  })
}
