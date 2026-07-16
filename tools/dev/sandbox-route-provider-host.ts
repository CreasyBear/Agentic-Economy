import { pathToFileURL } from 'node:url'

import { loadEnv } from 'vite'

import { createSandboxRouteProviderServer } from '../../src/lib/server/sandbox-route-provider-host'
import type { SandboxRouteProviderProfileKey } from '../../src/modules/sandbox-supply/public'

export function sandboxRouteProviderHostConfig(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Readonly<{ routeKey: SandboxRouteProviderProfileKey; host: string; port: number; providerKey: string }> {
  const routeKey = option(argv, '--route')
  if (routeKey !== 'resolver' && routeKey !== 'quoter') throw new Error('--route must be resolver or quoter')
  const port = Number(option(argv, '--port'))
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('--port must be a valid TCP port')
  const providerKey = env.AE_SANDBOX_PROVIDER_KEY?.trim()
  if (!providerKey) throw new Error('AE_SANDBOX_PROVIDER_KEY is required')
  return { routeKey, port, providerKey, host: option(argv, '--host') ?? '127.0.0.1' }
}

async function main(): Promise<void> {
  const config = sandboxRouteProviderHostConfig(process.argv.slice(2), {
    ...loadEnv('development', process.cwd(), ''),
    ...process.env,
  })
  const server = createSandboxRouteProviderServer(config)
  server.listen(config.port, config.host, () => {
    process.stdout.write(`${JSON.stringify({
      kind: 'sandbox_route_provider_ready',
      route: config.routeKey,
      origin: `http://${config.host}:${config.port}`,
      claimBoundary: 'source_owned_test_endpoint_not_independent_supply_or_fulfilment',
    })}\n`)
  })
}

function option(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index < 0 ? undefined : argv[index + 1]
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'sandbox_route_provider_host_failed')
    process.exitCode = 1
  })
}
