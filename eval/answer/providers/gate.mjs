import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const scriptPath = path.join(rootDir, 'eval/answer/scripts/run-case.ts')

export default class GateProvider {
  id() {
    return 'ae-gate'
  }

  async callApi(_prompt, context) {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', scriptPath, JSON.stringify(context.vars)],
      { cwd: rootDir },
    )

    return {
      output: stdout.trim(),
    }
  }
}
