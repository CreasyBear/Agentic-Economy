import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * CLI spawn tests (tests/unit/market-terminal/**) exec the built AE CLI
 * bundle instead of transpiling tools/ae/cli.ts on every spawn via tsx, so
 * each spawn skips a ~0.5-0.9s transpile. Building once in globalSetup keeps
 * that win without duplicating build logic: this runs the exact same script
 * as `npm run build:cli` (packages/cli/package.json `build`), just invoked
 * directly instead of through two npm run layers.
 */
export default async function setup(): Promise<void> {
  const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
  execFileSync(process.execPath, ['scripts/build-cli.mjs'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  })
}
