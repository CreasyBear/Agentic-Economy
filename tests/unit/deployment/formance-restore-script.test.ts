import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const runFile = promisify(execFile)
const directories: string[] = []
const name = 'package4-release-restore-20261001'
const sourceName = 'package4-release-formance'
const restoreTime = '2026-10-01T01:02:03.456Z'
const endpoint = 'isolated.example.rds.amazonaws.com'
const secret = 'arn:aws:secretsmanager:ap-southeast-2:197716152388:secret:isolated'
const source = { DBInstanceIdentifier: sourceName,
  DBInstanceArn: `arn:aws:rds:ap-southeast-2:197716152388:db:${sourceName}`, DbiResourceId: 'db-source',
  Endpoint: { Address: 'source.example.rds.amazonaws.com' }, MasterUserSecret: { SecretArn: `${secret}-source` } }
const target = { DBInstanceIdentifier: name,
  DBInstanceArn: `arn:aws:rds:ap-southeast-2:197716152388:db:${name}`, DbiResourceId: 'db-isolated',
  DBInstanceStatus: 'available', PubliclyAccessible: false, StorageEncrypted: true,
  Endpoint: { Address: endpoint }, MasterUserSecret: { SecretArn: secret } }

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
elif command == 'curl': pass
elif command == 'kubectl':
    if 'deployment' in args and 'get' in args: print('1')
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

async function execute(targetRows: unknown[], sourceRows: unknown[] = [source]) {
  const directory = await mkdtemp(join(tmpdir(), 'ae-restore-script-'))
  directories.push(directory)
  const baseline = join(directory, 'baseline.json')
  const command = join(directory, 'command.json')
  const identities = join(directory, 'identities.json')
  const calls = join(directory, 'calls.txt')
  await Promise.all([
    ...['node', 'npm', 'curl', 'kubectl', 'aws'].map(file => writeFile(join(directory, file), stub, { mode: 0o700 })),
    writeFile(baseline, JSON.stringify({ restoreTime, summary: { ledger: 'agentic-economy-release' } })),
    writeFile(command, '{}'), writeFile(identities, JSON.stringify({ [name]: targetRows, [sourceName]: sourceRows })),
    writeFile(calls, ''),
  ])
  let status: unknown
  let output = ''
  try {
    const result = await runFile('bash', [resolve('infra/package4/recovery-drill/verify-restored-formance.sh'),
      name, endpoint, secret, baseline, command, restoreTime], {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH ?? ''}`,
        RESTORE_FIXTURE_IDENTITIES: identities, RESTORE_FIXTURE_CALLS: calls }, timeout: 10_000,
    })
    status = 0; output = result.stdout
  } catch (error) {
    status = (error as { code?: unknown }).code
    output = (error as { stdout?: string }).stdout ?? ''
  }
  return { status, output, calls: await readFile(calls, 'utf8') }
}

afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('cloud restore target identity boundary', () => {
  it.each([
    ['source endpoint', { ...target, Endpoint: source.Endpoint }],
    ['source secret', { ...target, MasterUserSecret: source.MasterUserSecret }],
    ['same physical database', { ...target, DbiResourceId: source.DbiResourceId }],
    ['wrong account', { ...target, DBInstanceArn: `arn:aws:rds:ap-southeast-2:000000000000:db:${name}` }],
    ['not yet available', { ...target, DBInstanceStatus: 'creating' }],
    ['public target', { ...target, PubliclyAccessible: true }],
  ])('refuses %s before reading any secret or mutating Kubernetes', async (_label, invalid) => {
    const result = await execute([invalid])
    expect(result.status).toBe(1)
    expect(result.calls).toContain('aws rds describe-db-instances')
    expect(result.calls).not.toContain('secretsmanager')
    expect(result.calls).not.toContain('kubectl apply')
    expect(result.output).not.toContain('PASS')
  })

  it('requires exactly one target and a usable source identity', async () => {
    for (const [targets, sources] of [[[], [source]], [[target, target], [source]], [[target], []]]) {
      const result = await execute(targets!, sources!)
      expect(result.status).toBe(1)
      expect(result.calls).not.toContain('secretsmanager')
    }
  })

  it('reaches only the named target secret after all identity checks pass', async () => {
    const result = await execute([target])
    expect(result.status).toBe(73)
    expect(result.calls).toContain(`--db-instance-identifier ${name}`)
    expect(result.calls).toContain(`--db-instance-identifier ${sourceName}`)
    expect(result.calls).toContain(`aws secretsmanager get-secret-value --region ap-southeast-2 --secret-id ${secret}`)
    expect(result.calls).not.toContain('kubectl apply')
    expect(result.output).not.toContain('PASS')
  })
})
