import { spawnSync } from 'node:child_process'

const secret = spawnSync(process.execPath, ['node_modules/convex/bin/main.js', 'env', 'get',
  'OPENROUTER_API_KEY', '--deployment', 'upbeat-cricket-954'], { encoding: 'utf8' })
if (secret.status !== 0 || !secret.stdout.trim()) throw new Error('trial_model_credential_unavailable')
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
  'tests/integration/chat-research-action-trial.test.ts', '-t', 'records the research journey'], {
  env: { ...process.env, OPENROUTER_API_KEY: secret.stdout.trim(), AE_LIVE_CHAT_TRIAL: '1', AE_CHAT_TRIAL_REPORT: '1' },
  stdio: 'inherit',
})
process.exitCode = result.status ?? 1
