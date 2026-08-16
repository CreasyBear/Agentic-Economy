import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PRODUCT_FRONTIER_MANIFEST_VERSION = 'ae-product-frontier:v1'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const manifestPath = join(root, '.planning/evidence/product-frontier-baseline/product-frontier-manifest.json')

/** @type {Readonly<Record<string, unknown>>} */
export const productFrontierManifest = Object.freeze(
  JSON.parse(readFileSync(manifestPath, 'utf8')),
)

export function productFrontierManifestPath(cwd = process.cwd()) {
  return join(cwd, '.planning/evidence/product-frontier-baseline/product-frontier-manifest.json')
}
