import { spawn } from 'node:child_process'

import { configureLocalSourceWriteSecret } from './local-source-write-secret.mjs'

const { secret, adminKey } = await configureLocalSourceWriteSecret()

const forwardedArgs = process.argv.slice(2)
const appArgs = forwardedArgs.length > 0
  ? forwardedArgs
  : ['--port', '3024', '--strictPort', '--host', '127.0.0.1']

const app = spawn('npm', ['run', 'dev', '--', ...appArgs], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AE_SOURCE_WRITE_SECRET: secret,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
    AE_ENGINE_PROPOSALS: process.env.AE_ENGINE_PROPOSALS ?? 'false',
    VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E ?? 'true',
  },
  stdio: 'inherit',
})

const stop = (signal) => {
  if (app.exitCode === null) app.kill(signal)
}
process.once('SIGINT', () => stop('SIGINT'))
process.once('SIGTERM', () => stop('SIGTERM'))

const exitCode = await new Promise((resolve, reject) => {
  app.once('error', reject)
  app.once('exit', (code, signal) => resolve(code ?? (signal === null ? 1 : 0)))
})
process.exitCode = exitCode
