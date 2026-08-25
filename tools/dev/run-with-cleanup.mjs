import { execFile, spawn } from 'node:child_process'
import { lstat, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROCESS_LIST_ARGS = ['-axo', 'pid=,ppid=,command=']
const TRANSIENT_CACHE_PATHS = [
  'node_modules/.vite',
  'node_modules/.cache',
  '.vite',
  '.vinxi',
  '.tanstack',
  '.cache',
]
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const HEADLESS_FLAG = /(?:^|\s)--headless(?:[=\s]|$)/i
const TEST_MARKER = /playwright|puppeteer/i
const TEST_PROFILE = /(?:puppeteer_dev_chrome_profile|playwright(?:[_-][a-z0-9]+)*[_-]?profile)/i
const BROWSER_EXECUTABLE = /(?:^|[\/\s])(?:google chrome|chrom(?:e|ium)?|firefox|webkit|headless[_-]?shell)(?:[-_][\w-]+)?(?:\.app)?(?:[\/\s]|$)/i
const PROTECTED_PROFILE = /\borca\b|omp-chrome-profile|(?:^|[\/_=\s-])interactive(?:[\/_.\s-]|$)/i
const SIGNAL_EXIT_CODES = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }

function parseCli(argv) {
  let index = 0
  let dryRun = false
  let cleanupOnly = false
  while (index < argv.length) {
    if (argv[index] === '--dry-run') {
      dryRun = true
      index += 1
      continue
    }
    if (argv[index] === '--cleanup-only') {
      cleanupOnly = true
      index += 1
      continue
    }
    break
  }

  if (cleanupOnly && index < argv.length) {
    throw new Error('--cleanup-only does not accept a command')
  }
  if (!cleanupOnly && index >= argv.length) {
    throw new Error('missing command')
  }

  const commandArgs = argv.slice(index)
  const env = { ...process.env }
  while (commandArgs.length > 0 && ENV_ASSIGNMENT.test(commandArgs[0])) {
    const assignment = commandArgs.shift()
    const separator = assignment.indexOf('=')
    env[assignment.slice(0, separator)] = assignment.slice(separator + 1)
  }
  if (!cleanupOnly && commandArgs.length === 0) throw new Error('missing command')

  return {
    cleanupOnly,
    dryRun,
    command: commandArgs[0],
    args: commandArgs.slice(1),
    env,
  }
}

async function listProcesses() {
  try {
    const { stdout } = await execFileAsync('ps', PROCESS_LIST_ARGS, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    const processes = []
    for (const line of stdout.split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)
      if (match === null) continue
      processes.push({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] })
    }
    return processes
  } catch {
    return null
  }
}

function processMap(processes) {
  return new Map(processes.map((entry) => [entry.pid, entry]))
}

function childMap(processes) {
  const children = new Map()
  for (const entry of processes) {
    const siblings = children.get(entry.ppid)
    if (siblings === undefined) children.set(entry.ppid, [entry.pid])
    else siblings.push(entry.pid)
  }
  return children
}

function descendantsOf(rootPid, children) {
  const descendants = new Set()
  const pending = [...(children.get(rootPid) ?? [])]
  while (pending.length > 0) {
    const pid = pending.pop()
    if (pid === undefined || descendants.has(pid)) continue
    descendants.add(pid)
    pending.push(...(children.get(pid) ?? []))
  }
  return descendants
}

function isTestBrowser(command) {
  if (PROTECTED_PROFILE.test(command)) return false
  if (!BROWSER_EXECUTABLE.test(command)) return false
  if (!TEST_MARKER.test(command)) return false
  return HEADLESS_FLAG.test(command) || TEST_PROFILE.test(command)
}

function isProtected(command) {
  return PROTECTED_PROFILE.test(command)
}

function selectBrowserProcesses(processes, baseline) {
  if (baseline === null) return []
  const byPid = processMap(processes)
  const children = childMap(processes)
  const selected = new Set()

  for (const entry of processes) {
    if (entry.pid === process.pid || baseline.has(entry.pid)) continue
    if (!isTestBrowser(entry.command)) continue
    selected.add(entry.pid)
    for (const descendant of descendantsOf(entry.pid, children)) {
      const descendantInfo = byPid.get(descendant)
      if (descendantInfo !== undefined && !baseline.has(descendant) && !isProtected(descendantInfo.command)) {
        selected.add(descendant)
      }
    }
  }
  return [...selected]
}

function orderedPids(pids, processes) {
  const byPid = processMap(processes)
  const depth = (pid) => {
    let value = 0
    let current = byPid.get(pid)
    const seen = new Set()
    while (current !== undefined && current.ppid !== 0 && !seen.has(current.ppid)) {
      seen.add(current.ppid)
      current = byPid.get(current.ppid)
      value += 1
    }
    return value
  }
  return [...pids].sort((left, right) => depth(right) - depth(left) || right - left)
}

async function cleanupCaches(dryRun) {
  let count = 0
  let failures = 0
  for (const relativePath of TRANSIENT_CACHE_PATHS) {
    const target = join(PROJECT_ROOT, relativePath)
    try {
      await lstat(target)
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      failures += 1
      continue
    }
    if (dryRun) {
      count += 1
      continue
    }
    try {
      await rm(target, { recursive: true, force: true })
      count += 1
    } catch {
      failures += 1
    }
  }
  return { count, failures }
}

async function terminateBrowsers(pids, processes, dryRun) {
  if (dryRun) return { count: pids.length, failures: 0 }
  const terminated = new Set()
  let failures = 0
  for (const pid of orderedPids(pids, processes)) {
    try {
      process.kill(pid, 'SIGTERM')
      terminated.add(pid)
    } catch (error) {
      if (error?.code !== 'ESRCH') failures += 1
    }
  }
  if (terminated.size === 0) return { count: 0, failures }

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  for (const pid of pids) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if (error?.code !== 'ESRCH') failures += 1
      continue
    }
    try {
      process.kill(pid, 'SIGKILL')
    } catch (error) {
      if (error?.code !== 'ESRCH') failures += 1
    }
  }
  return { count: terminated.size, failures }
}

async function cleanup({ baseline, dryRun }) {
  const caches = await cleanupCaches(dryRun)
  let browsers = { count: 0, failures: 0 }
  let warning = false
  if (baseline !== null) {
    const processes = await listProcesses()
    if (processes === null) warning = true
    else {
      const pids = selectBrowserProcesses(processes, baseline)
      browsers = await terminateBrowsers(pids, processes, dryRun)
    }
  }
  const verb = dryRun ? 'would-remove' : 'removed'
  const browserVerb = dryRun ? 'would-terminate' : 'terminated'
  console.log(`cleanup: caches ${verb}=${caches.count}, browsers ${browserVerb}=${browsers.count}`)
  if (caches.failures > 0 || browsers.failures > 0 || warning) {
    console.error('cleanup: some entries could not be inspected or terminated')
  }
}

function runCommand(command, args, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      env,
      shell: false,
      stdio: 'inherit',
    })
    const forwardSignal = (signal) => {
      try {
        child.kill(signal)
      } catch {
        // The child may have exited between the signal and this handler.
      }
    }
    const signalHandlers = {
      SIGHUP: () => forwardSignal('SIGHUP'),
      SIGINT: () => forwardSignal('SIGINT'),
      SIGTERM: () => forwardSignal('SIGTERM'),
    }
    for (const [signal, handler] of Object.entries(signalHandlers)) process.on(signal, handler)
    const removeSignalHandlers = () => {
      for (const [signal, handler] of Object.entries(signalHandlers)) process.removeListener(signal, handler)
    }
    child.once('error', (error) => {
      removeSignalHandlers()
      resolvePromise({ child, code: 1, signal: null, error })
    })
    child.once('close', (code, signal) => {
      removeSignalHandlers()
      resolvePromise({ child, code, signal, error: null })
    })
  })
}

async function main() {
  let cli
  try {
    cli = parseCli(process.argv.slice(2))
  } catch (error) {
    console.error(`run-with-cleanup: ${error.message}`)
    console.error('usage: node tools/dev/run-with-cleanup.mjs [--dry-run] [--cleanup-only | command args...]')
    return 2
  }

  const processSnapshot = cli.cleanupOnly ? null : await listProcesses()
  const baseline = processSnapshot === null ? null : processMap(processSnapshot)
  let result = { code: 0, signal: null, error: null, child: null }
  try {
    if (!cli.cleanupOnly) result = await runCommand(cli.command, cli.args, cli.env)
  } finally {
    await cleanup({ baseline, dryRun: cli.dryRun })
  }

  if (result.error !== null) {
    console.error(`run-with-cleanup: ${result.error.message}`)
    return 1
  }
  if (result.code !== null) return result.code
  return SIGNAL_EXIT_CODES[result.signal] ?? 1
}

process.exitCode = await main()
