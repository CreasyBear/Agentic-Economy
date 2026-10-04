import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

it('returns a safe custody result from a split Node bundle sharing the guarded HTTP transport', async () => {
  const directory = mkdtempSync(join(process.cwd(), '.cdp-readiness-bundle-'))
  try {
    await build({
      entryPoints: {
        custody: 'src/modules/capability-supply/internal/cdp-x402-custody-readiness.ts',
        guarded: 'src/modules/network-guard/server.ts',
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      splitting: true,
      outdir: directory,
      external: ['@coinbase/cdp-sdk/*'],
      banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    })
    // Invalid local fixture credentials fail during authentication, before I/O.
    // This still exercises real module loading and Agent construction, which
    // mocked unit imports cannot prove for the deployment's shared chunks.
    const environment = {
      AE_X402_CUSTODY_ENABLED: 'true',
      CDP_API_KEY_ID: 'fixture-key',
      CDP_API_KEY_SECRET: 'invalid-fixture-secret',
      CDP_WALLET_SECRET: 'fixture-wallet-secret',
      AE_X402_CDP_ACCOUNT_NAME: 'fixture-custody',
      AE_X402_CDP_EXPECTED_EVM_ADDRESS: `0x${'11'.repeat(20)}`,
      AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
      AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
      AE_X402_CDP_POLICY_RULES_DIGEST: `sha256:${'a'.repeat(64)}`,
      AE_X402_CDP_CREDENTIAL_GENERATION: '1',
      AE_X402_CUSTODY_MAX_ATOMIC: '10000',
      AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
    }
    const script = `
      import { readCdpX402CustodyReadiness } from ${JSON.stringify(join(directory, 'custody.js'))};
      const result = await readCdpX402CustodyReadiness(${JSON.stringify(environment)}, 'production');
      console.log(JSON.stringify(result));
    `
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000,
    })
    expect(JSON.parse(output)).toEqual({ kind: 'unavailable', code: 'cdp_custody_read_unavailable' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
