import { pathToFileURL } from 'node:url'

import {
  validateDeploymentManifest,
  type DeploymentEnvironment,
  type DeploymentEnvironmentInput,
  type DeploymentValidationResult,
} from '../../src/lib/deployment/manifest'

type CliOptions = Readonly<{
  json: boolean
  environment: DeploymentEnvironment
}>

export function main(
  environment: DeploymentEnvironmentInput = process.env,
  argv: readonly string[] = process.argv.slice(2),
): void {
  const options = parseOptions(argv)
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)
  const result = validateDeploymentManifest(environment, {
    environment: options.environment,
    ...(Number.isSafeInteger(nodeMajor) ? { nodeMajor } : {}),
  })

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } else {
    writeHumanResult(result)
  }
  if (!result.ok) process.exitCode = 1
}

function parseOptions(argv: readonly string[]): CliOptions {
  let json = false
  let environment: DeploymentEnvironment = 'production'
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--json') {
      json = true
      continue
    }
    if (argument === '--environment') {
      const value = argv[index + 1]
      if (value === undefined) throw new Error('deployment_manifest_environment_missing')
      environment = parseEnvironment(value)
      index += 1
      continue
    }
    if (argument.startsWith('--environment=')) {
      environment = parseEnvironment(argument.slice('--environment='.length))
      continue
    }
    throw new Error('deployment_manifest_argument_invalid')
  }
  return { json, environment }
}

function parseEnvironment(value: string): DeploymentEnvironment {
  if (value === 'production' || value === 'preview' || value === 'development' || value === 'test') return value
  throw new Error('deployment_manifest_environment_invalid')
}

function writeHumanResult(result: DeploymentValidationResult): void {
  process.stdout.write(`deployment manifest: ${result.ok ? 'valid' : 'invalid'}\n`)
  process.stdout.write(`environment: ${result.environment}\n`)
  process.stdout.write(`fingerprint: ${result.fingerprint}\n`)
  process.stdout.write(`runtime: node ${result.runtime.expectedNodeMajor} (${result.runtime.compatible ? 'compatible' : 'incompatible'})\n`)
  if (result.findings.length === 0) return
  process.stdout.write('findings:\n')
  for (const finding of result.findings) {
    process.stdout.write(`- ${finding.kind}:${finding.scope}:${finding.code}:${finding.names.join(',')}\n`)
  }
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) main()
