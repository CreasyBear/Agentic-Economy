import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import {
  GatewayProductionSmokeReceiptSchema,
  resolveGatewayReceiptPath,
  type GatewayProductionSmokeReceipt,
} from './operation-gateway-production-smoke'

type Environment = Record<string, string | undefined>

export type GatewayProductionSmokeReceiptValidationOptions = Readonly<{
  expectedSourceRevision?: string
  expectedVercelDeploymentId?: string
  expectedProductionUrl?: string
  expectedConvexDeploymentId?: string
  expectedConvexUrl?: string
}>
 

export function validateGatewayProductionSmokeReceipt(
  value: unknown,
  options: GatewayProductionSmokeReceiptValidationOptions = {},
): GatewayProductionSmokeReceipt {
  const receipt = GatewayProductionSmokeReceiptSchema.parse(value)
  if (options.expectedSourceRevision !== undefined && receipt.deployment.sourceRevision !== options.expectedSourceRevision) throw new Error('gateway_smoke_receipt_source_revision_mismatch')
  if (options.expectedVercelDeploymentId !== undefined && receipt.deployment.vercelDeploymentId !== options.expectedVercelDeploymentId) throw new Error('gateway_smoke_receipt_deployment_mismatch')
  if (options.expectedProductionUrl !== undefined && new URL(receipt.deployment.productionUrl).href !== new URL(options.expectedProductionUrl).href) throw new Error('gateway_smoke_receipt_base_url_mismatch')
  if (options.expectedConvexDeploymentId !== undefined && receipt.deployment.convexDeploymentId !== options.expectedConvexDeploymentId) throw new Error('gateway_smoke_receipt_convex_deployment_mismatch')
  if (options.expectedConvexUrl !== undefined && new URL(receipt.deployment.convexUrl).href !== new URL(options.expectedConvexUrl).href) throw new Error('gateway_smoke_receipt_convex_url_mismatch')
  return receipt
}

export async function validateGatewayProductionSmokeReceiptFile(
  receiptPath: string,
  options: GatewayProductionSmokeReceiptValidationOptions = {},
): Promise<GatewayProductionSmokeReceipt> {
  const destination = resolveGatewayReceiptPath(receiptPath)
  let text: string
  try {
    text = await readFile(destination, 'utf8')
  } catch {
    throw new Error('gateway_smoke_receipt_read_failed')
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('gateway_smoke_receipt_json_invalid')
  }
  return validateGatewayProductionSmokeReceipt(value, options)
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  env: Environment = process.env,
): Promise<GatewayProductionSmokeReceipt> {
  if (args.length !== 1) throw new Error('gateway_smoke_receipt_validator_requires_one_path')
  return validateGatewayProductionSmokeReceiptFile(args[0]!, {
    ...(env.AE_RELEASE_SOURCE_REVISION?.trim() === undefined ? {} : { expectedSourceRevision: env.AE_RELEASE_SOURCE_REVISION.trim() }),
    ...(env.AE_RELEASE_DEPLOYMENT_ID?.trim() === undefined ? {} : { expectedVercelDeploymentId: env.AE_RELEASE_DEPLOYMENT_ID.trim() }),
    ...(env.AE_GATEWAY_SMOKE_BASE_URL?.trim() === undefined ? {} : { expectedProductionUrl: env.AE_GATEWAY_SMOKE_BASE_URL.trim() }),
    ...(env.AE_RELEASE_CONVEX_DEPLOYMENT_ID?.trim() === undefined ? {} : { expectedConvexDeploymentId: env.AE_RELEASE_CONVEX_DEPLOYMENT_ID.trim() }),
    ...(env.AE_RELEASE_CONVEX_URL?.trim() === undefined ? {} : { expectedConvexUrl: env.AE_RELEASE_CONVEX_URL.trim() }),
  })
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  try {
    await main()
    process.stdout.write('Operation gateway receipt validated\n')
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
