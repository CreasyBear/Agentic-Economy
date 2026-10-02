import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const runFile = promisify(execFile)
const directories: string[] = []
const restoreTime = '2026-10-01T01:02:03.456Z'
const endpoint = 'isolated.example.rds.amazonaws.com'
const secret = 'arn:aws:secretsmanager:ap-southeast-2:197716152388:secret:isolated'

function identities(sourceNamespace: string, name: string) {
  const sourceName = `${sourceNamespace}-formance`
  return {
    source: { DBInstanceIdentifier: sourceName,
      DBInstanceArn: `arn:aws:rds:ap-southeast-2:197716152388:db:${sourceName}`, DbiResourceId: 'db-source',
      Endpoint: { Address: 'source.example.rds.amazonaws.com' }, MasterUserSecret: { SecretArn: `${secret}-source` } },
    target: { DBInstanceIdentifier: name,
      DBInstanceArn: `arn:aws:rds:ap-southeast-2:197716152388:db:${name}`, DbiResourceId: 'db-isolated',
      DBInstanceStatus: 'available', PubliclyAccessible: false, StorageEncrypted: true,
      Endpoint: { Address: endpoint }, MasterUserSecret: { SecretArn: secret } },
  }
}

// Replace only external command boundaries. Execute the maintained shell, jq
// checks and actual branch ordering; a secret read ends the fixture immediately.
const stub = `#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
command = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ['RESTORE_FIXTURE_CALLS'], 'a') as log:
    log.write(command + ' ' + ' '.join(args) + '\\n')
if command == 'node': print('22')
elif command == 'npm': print('11.5.1')
elif command == 'curl':
    if '/_healthcheck' in ' '.join(args):
        removed = Path(os.environ['RESTORE_FIXTURE_REMOVED']).exists()
        failure = os.environ.get('RESTORE_FIXTURE_FAIL_HEALTH')
        if (failure == 'before' and not removed) or (failure == 'after' and removed): sys.exit(72)
elif command == 'kubectl':
    if args[:2] == ['get', 'namespace']:
        if os.environ.get('RESTORE_FIXTURE_FAIL_NAMESPACE') == 'true': sys.exit(75)
        if Path(os.environ['RESTORE_FIXTURE_REMOVED']).exists():
            sys.exit(0 if '--ignore-not-found' in args else 1)
        print('namespace/' + args[2])
    elif args and args[0] == 'delete':
        if os.environ.get('RESTORE_FIXTURE_FAIL_DELETE') == args[1]: sys.exit(74)
        if args[1] == 'stack': Path(os.environ['RESTORE_FIXTURE_REMOVED']).touch()
    elif 'deployment' in args and 'get' in args: print('1')
    elif 'service' in args and 'get' in args: print('127.0.0.1')
    else: sys.exit(91)
elif command == 'aws':
    if args[:2] == ['rds', 'describe-db-instances']:
        identity = args[args.index('--db-instance-identifier') + 1]
        data = json.loads(Path(os.environ['RESTORE_FIXTURE_IDENTITIES']).read_text())
        print(json.dumps(data[identity]))
    elif args[:2] == ['secretsmanager', 'get-secret-value']: sys.exit(73)
    else: sys.exit(92)
else: sys.exit(93)
`

type ScriptOptions = {
  fixtureDirectory?: string
  sourceNamespace?: string
  sourceLedger?: string
  name?: string
  targetRows?: unknown[]
  sourceRows?: unknown[]
  baselineLedger?: string
  baselineRestoreTime?: string
  mode?: 'verify' | 'cleanup'
  confirmation?: string
  failHealth?: 'before' | 'after'
  failDelete?: string
  failNamespace?: boolean
}

async function execute(options: ScriptOptions = {}) {
  const sourceNamespace = options.sourceNamespace ?? 'package4-release'
  const sourceLedger = options.sourceLedger ?? 'agentic-economy-release'
  const name = options.name ?? `${sourceNamespace}-restore-20261001`
  const { source, target } = identities(sourceNamespace, name)
  const directory = options.fixtureDirectory ?? await mkdtemp(join(tmpdir(), 'ae-restore-script-'))
  if (options.fixtureDirectory === undefined) directories.push(directory)
  const baseline = join(directory, 'baseline.json')
  const command = join(directory, 'command.json')
  const identitiesPath = join(directory, 'identities.json')
  const calls = join(directory, 'calls.txt')
  await Promise.all([
    ...['node', 'npm', 'curl', 'kubectl', 'aws'].map(file => writeFile(join(directory, file), stub, { mode: 0o700 })),
    writeFile(baseline, JSON.stringify({ restoreTime: options.baselineRestoreTime ?? restoreTime,
      summary: { ledger: options.baselineLedger ?? sourceLedger } })),
    writeFile(command, '{}'), writeFile(identitiesPath, JSON.stringify({
      [name]: options.targetRows ?? [target], [`${sourceNamespace}-formance`]: options.sourceRows ?? [source],
    })),
    writeFile(calls, ''),
  ])
  let status: unknown
  let output = ''
  let stderr = ''
  try {
    const result = await runFile('bash', options.mode === 'cleanup'
      ? [resolve('infra/package4/recovery-drill/cleanup-restored-formance.sh'), sourceNamespace, sourceLedger, name,
          options.confirmation ?? '--confirmed-by-joel']
      : [resolve('infra/package4/recovery-drill/verify-restored-formance.sh'), sourceNamespace, sourceLedger,
          name, endpoint, secret, baseline, command, restoreTime], {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH ?? ''}`,
        RESTORE_FIXTURE_IDENTITIES: identitiesPath, RESTORE_FIXTURE_CALLS: calls,
        RESTORE_FIXTURE_REMOVED: join(directory, 'removed'),
        RESTORE_FIXTURE_FAIL_HEALTH: options.failHealth ?? '', RESTORE_FIXTURE_FAIL_DELETE: options.failDelete ?? '',
        RESTORE_FIXTURE_FAIL_NAMESPACE: options.failNamespace ? 'true' : '' },
      timeout: 10_000,
    })
    status = 0; output = result.stdout; stderr = result.stderr
  } catch (error) {
    status = (error as { code?: unknown }).code
    output = (error as { stdout?: string }).stdout ?? ''
    stderr = (error as { stderr?: string }).stderr ?? ''
  }
  return { directory, status, output, stderr, calls: await readFile(calls, 'utf8') }
}

afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe.each([
  { sourceNamespace: 'package4-release', sourceLedger: 'agentic-economy-release' },
  { sourceNamespace: 'ae-alpha', sourceLedger: 'agentic-economy-alpha' },
])('cloud restore target identity boundary ($sourceNamespace)', (binding) => {
  const name = `${binding.sourceNamespace}-restore-20261001`
  const { source, target } = identities(binding.sourceNamespace, name)
  it.each([
    ['source endpoint', { ...target, Endpoint: source.Endpoint }],
    ['source secret', { ...target, MasterUserSecret: source.MasterUserSecret }],
    ['same physical database', { ...target, DbiResourceId: source.DbiResourceId }],
    ['wrong account', { ...target, DBInstanceArn: `arn:aws:rds:ap-southeast-2:000000000000:db:${name}` }],
    ['not yet available', { ...target, DBInstanceStatus: 'creating' }],
    ['public target', { ...target, PubliclyAccessible: true }],
  ])('refuses %s before reading any secret or mutating Kubernetes', async (_label, invalid) => {
    const result = await execute({ ...binding, targetRows: [invalid] })
    expect(result.status, result.stderr).toBe(1)
    expect(result.calls).toContain('aws rds describe-db-instances')
    expect(result.calls).not.toContain('secretsmanager')
    expect(result.calls).not.toContain('kubectl apply')
    expect(result.output).not.toContain('PASS')
  })

  it('requires exactly one target and a usable source identity', async () => {
    for (const [targets, sources] of [[[], [source]], [[target, target], [source]], [[target], []]]) {
      const result = await execute({ ...binding, targetRows: targets!, sourceRows: sources! })
      expect(result.status, result.stderr).toBe(1)
      expect(result.calls).not.toContain('secretsmanager')
    }
  })

  it('reaches only the named target secret after all identity checks pass', async () => {
    const result = await execute(binding)
    expect(result.status, result.stderr).toBe(73)
    expect(result.calls).toContain(`--db-instance-identifier ${name}`)
    expect(result.calls).toContain(`--db-instance-identifier ${binding.sourceNamespace}-formance`)
    expect(result.calls).toContain(`kubectl -n ${binding.sourceNamespace} get service gateway`)
    expect(result.calls).toContain(`aws secretsmanager get-secret-value --region ap-southeast-2 --secret-id ${secret}`)
    expect(result.calls).not.toContain('kubectl apply')
    expect(result.output).not.toContain('PASS')
  })

  it('cleans up only resources belonging to the explicit isolated drill', async () => {
    const result = await execute({ ...binding, mode: 'cleanup' })
    expect(result.status, result.stderr).toBe(0)
    expect(result.calls.split('\n').filter(line => line.startsWith('kubectl delete'))).toEqual([
      `kubectl delete ledger ${name}-ledger --ignore-not-found --wait=true`,
      `kubectl delete gateway ${name}-gateway --ignore-not-found --wait=true`,
      `kubectl delete stack ${name} --ignore-not-found --wait=true`,
      `kubectl delete settings ${name}-postgres ${name}-caddy-image ${name}-schema-enforcement --ignore-not-found --wait=true`,
      `kubectl delete versions ${name}-pins --ignore-not-found --wait=true`,
    ])
    expect(result.calls.split('\n').filter(line => line.includes(`/api/ledger/v2/${binding.sourceLedger}/transactions`))).toHaveLength(2)
    expect(result.output).toContain(`source_namespace=${binding.sourceNamespace}\nsource_ledger=${binding.sourceLedger}`)
    expect(result.output).toContain('source_verification=PASS\ncleanup=PASS')
    expect(result.calls).not.toContain('aws ')
  })
})

describe.each(['verify', 'cleanup'] as const)('restore %s input boundary', (mode) => {
  it.each([
    ['invalid source namespace', { sourceNamespace: 'ae.alpha' }],
    ['short source namespace', { sourceNamespace: 'ae' }],
    ['long source namespace', { sourceNamespace: 'a'.repeat(32) }],
    ['invalid ledger', { sourceLedger: 'ledger/other' }],
    ['long ledger', { sourceLedger: 'a'.repeat(64) }],
    ['cross-source drill', { sourceNamespace: 'ae-alpha', name: 'package4-release-restore-20261001' }],
    ['source namespace as target', { name: 'package4-release' }],
    ['invalid drill date', { name: 'package4-release-restore-2026-10-01' }],
  ] satisfies Array<[string, ScriptOptions]>)('refuses %s before external commands', async (_label, invalid) => {
    const result = await execute({ ...invalid, mode })
    expect(result.status, result.stderr).toBe(1)
    expect(result.stderr).toContain('refusing')
    expect(result.calls).toBe('')
    expect(result.output).not.toContain('PASS')
  })
})

describe('restore baseline and cleanup refusal', () => {
  it.each([
    { baselineLedger: 'different-ledger' },
    { baselineRestoreTime: '2026-10-01T01:02:04.456Z' },
  ])('refuses a baseline mismatch before secret access ($baselineLedger $baselineRestoreTime)', async (mismatch) => {
    const result = await execute({ sourceNamespace: 'ae-alpha', sourceLedger: 'agentic-economy-alpha', ...mismatch })
    expect(result.status, result.stderr).toBe(1)
    expect(result.calls).toBe('')
    expect(result.output).not.toContain('PASS')
  })

  it('requires cleanup confirmation before any external command', async () => {
    const result = await execute({ mode: 'cleanup', confirmation: '' })
    expect(result.status, result.stderr).toBe(1)
    expect(result.calls).toBe('')
    expect(result.stderr).toContain('cleanup requires Joel approval')
  })

  it('refuses deletion when source health cannot be established', async () => {
    const result = await execute({ mode: 'cleanup', sourceNamespace: 'ae-alpha', sourceLedger: 'agentic-economy-alpha', failHealth: 'before' })
    expect(result.status, result.stderr).toBe(72)
    expect(result.calls).not.toContain('kubectl delete')
    expect(result.output).not.toContain('PASS')
  })

  it('does not report success when a deletion fails', async () => {
    const result = await execute({ mode: 'cleanup', failDelete: 'stack' })
    expect(result.status, result.stderr).toBe(74)
    expect(result.calls).not.toContain('kubectl delete settings')
    expect(result.output).not.toContain('PASS')
  })

  it('does not report success when the final source health check fails', async () => {
    const result = await execute({ mode: 'cleanup', failHealth: 'after' })
    expect(result.status, result.stderr).toBe(72)
    expect(result.calls).toContain('kubectl delete stack')
    expect(result.output).not.toContain('PASS')
  })

  it('does not treat a namespace lookup failure as confirmed deletion', async () => {
    const result = await execute({ mode: 'cleanup', failNamespace: true })
    expect(result.status, result.stderr).toBe(75)
    expect(result.calls).toContain('kubectl delete stack')
    expect(result.output).not.toContain('PASS')
  })

  it.each(['partial', 'complete'] as const)('can repeat cleanup after %s removal of the drill', async (completion) => {
    const binding = { mode: 'cleanup' as const, sourceNamespace: 'ae-alpha', sourceLedger: 'agentic-economy-alpha' }
    const first = await execute({ ...binding, ...(completion === 'partial' ? { failDelete: 'settings' } : {}) })
    expect(first.status, first.stderr).toBe(completion === 'partial' ? 74 : 0)
    expect(first.calls).toContain('kubectl delete stack ae-alpha-restore-20261001')
    if (completion === 'partial') expect(first.output).not.toContain('PASS')

    const retry = await execute({ ...binding, fixtureDirectory: first.directory })
    expect(retry.status, retry.stderr).toBe(0)
    expect(retry.calls.split('\n').filter(line => line.startsWith('kubectl delete'))).toEqual([
      'kubectl delete ledger ae-alpha-restore-20261001-ledger --ignore-not-found --wait=true',
      'kubectl delete gateway ae-alpha-restore-20261001-gateway --ignore-not-found --wait=true',
      'kubectl delete stack ae-alpha-restore-20261001 --ignore-not-found --wait=true',
      'kubectl delete settings ae-alpha-restore-20261001-postgres ae-alpha-restore-20261001-caddy-image ae-alpha-restore-20261001-schema-enforcement --ignore-not-found --wait=true',
      'kubectl delete versions ae-alpha-restore-20261001-pins --ignore-not-found --wait=true',
    ])
    expect(retry.output).toContain('source_verification=PASS\ncleanup=PASS')
  })
})
