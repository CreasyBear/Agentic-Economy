import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const wrapperPath = resolve(projectRoot, 'tools/dev/run-with-cleanup.ts')
const browserArgs = ['-e', 'setInterval(() => {}, 1000)', 'chromium', '--headless', 'playwright']

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function stop(child: ChildProcessWithoutNullStreams | null): void {
  if (child?.pid !== undefined && isAlive(child.pid)) child.kill('SIGKILL')
}

function stopPid(pid: number | null): void {
  if (pid === null) return
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // The cleanup wrapper may already have reaped the process.
  }
}

describe.skipIf(process.platform === 'win32')('run-with-cleanup process ownership', () => {
  it('terminates its own headless browser and preserves one started concurrently elsewhere', async () => {
    const launcher = `
      import { spawn } from 'node:child_process';
      console.log('READY');
      process.stdin.once('data', () => {
        const browser = spawn(process.execPath, ${JSON.stringify(browserArgs)}, { stdio: 'ignore' });
        console.log('OWNED=' + browser.pid);
        setTimeout(() => process.exit(0), 200);
      });
    `
    const wrapper = spawn(process.execPath, [wrapperPath, process.execPath, '--input-type=module', '-e', launcher], {
      cwd: projectRoot,
      stdio: 'pipe',
    })
    let unrelated: ChildProcessWithoutNullStreams | null = null
    let ownedPid: number | null = null
    let output = ''
    const ready = new Promise<void>((resolveReady, rejectReady) => {
      wrapper.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString()
        const match = /OWNED=(\d+)/.exec(output)
        if (match) ownedPid = Number(match[1])
        if (output.includes('READY')) resolveReady()
      })
      wrapper.once('error', rejectReady)
      wrapper.once('close', () => rejectReady(new Error(`wrapper exited before ready: ${output}`)))
    })
    const finished = new Promise<number | null>((resolveFinished, rejectFinished) => {
      wrapper.once('close', resolveFinished)
      wrapper.once('error', rejectFinished)
    })

    try {
      await ready
      unrelated = spawn(process.execPath, browserArgs, { stdio: 'pipe' })
      await new Promise<void>((resolveSpawn, rejectSpawn) => {
        unrelated?.once('spawn', resolveSpawn)
        unrelated?.once('error', rejectSpawn)
      })
      wrapper.stdin.write('\n')
      expect(await finished).toBe(0)
      expect(ownedPid).toBeTypeOf('number')
      expect(output).toContain('cleanup: caches removed=0, browsers terminated=1')
      await expect.poll(() => ownedPid !== null && isAlive(ownedPid), { timeout: 2_000 }).toBe(false)
      expect(isAlive(unrelated.pid as number)).toBe(true)
    } finally {
      stop(wrapper)
      stop(unrelated)
      stopPid(ownedPid)
    }
  }, 15_000)

  it('forwards termination to an ordinary child worker and preserves the signal exit status', async () => {
    const launcher = `
      import { spawn } from 'node:child_process';
      const worker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      console.log('LEADER=' + process.pid + ' WORKER=' + worker.pid);
      setInterval(() => {}, 1000);
    `
    const wrapper = spawn(process.execPath, [wrapperPath, process.execPath, '--input-type=module', '-e', launcher], {
      cwd: projectRoot,
      stdio: 'pipe',
    })
    let leaderPid: number | null = null
    let workerPid: number | null = null
    let output = ''
    const started = new Promise<{ leaderPid: number, workerPid: number }>((resolveStarted, rejectStarted) => {
      wrapper.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString()
        const match = /LEADER=(\d+) WORKER=(\d+)/.exec(output)
        if (match) {
          resolveStarted({ leaderPid: Number(match[1]), workerPid: Number(match[2]) })
        }
      })
      wrapper.once('error', rejectStarted)
      wrapper.once('close', () => rejectStarted(new Error(`wrapper exited before worker started: ${output}`)))
    })
    const finished = new Promise<number | null>((resolveFinished, rejectFinished) => {
      wrapper.once('close', resolveFinished)
      wrapper.once('error', rejectFinished)
    })

    try {
      const startedPids = await started
      leaderPid = startedPids.leaderPid
      workerPid = startedPids.workerPid
      expect(isAlive(startedPids.leaderPid)).toBe(true)
      expect(isAlive(startedPids.workerPid)).toBe(true)
      wrapper.kill('SIGTERM')
      expect(await finished).toBe(143)
      await expect.poll(() => isAlive(startedPids.leaderPid), { timeout: 2_000 }).toBe(false)
      await expect.poll(() => isAlive(startedPids.workerPid), { timeout: 2_000 }).toBe(false)
    } finally {
      stop(wrapper)
      stopPid(leaderPid)
      stopPid(workerPid)
    }
  }, 15_000)
})
