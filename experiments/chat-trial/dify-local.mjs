import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import YAML from 'yaml'

// Local experiment only. No production configuration or credentials are read.
const root = resolve('output/chat-trial/vendor/dify/docker')
const project = 'ae-chat-trial'
const configPath = `${root}/trial-runtime-config`
const composePath = `${root}/trial-compose.yaml`
const services = ['init_permissions', 'db_postgres', 'redis', 'api', 'worker',
  'web', 'sandbox', 'plugin_daemon', 'ssrf_proxy', 'nginx']

if (process.argv[2] === 'prepare') {
  const revision = spawnSync('git', ['-C', resolve(root, '..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  if (revision.status !== 0 || revision.stdout.trim() !== '8387590ace4a094de812b7847fc6a4c3a27cd52b') {
    throw new Error('trial_dify_source_revision_mismatch')
  }
  const source = YAML.parse(readFileSync(`${root}/docker-compose.yaml`, 'utf8'), { merge: true })
  let template = readFileSync(existsSync(configPath) ? configPath : `${root}/.env.example`, 'utf8')
  const existing = existsSync(configPath)
    ? Object.fromEntries(template.split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => {
        const offset = line.indexOf('='); return [line.slice(0, offset), line.slice(offset + 1)]
      })) : {}
  const secret = name => existing[name] || randomBytes(32).toString('hex')
  const sandboxKey = secret('SANDBOX_API_KEY')
  const settings = {
    SECRET_KEY: secret('SECRET_KEY'), DB_PASSWORD: secret('DB_PASSWORD'),
    REDIS_PASSWORD: secret('REDIS_PASSWORD'), PLUGIN_DAEMON_KEY: secret('PLUGIN_DAEMON_KEY'),
    PLUGIN_DIFY_INNER_API_KEY: secret('PLUGIN_DIFY_INNER_API_KEY'),
    SANDBOX_API_KEY: sandboxKey, CODE_EXECUTION_API_KEY: sandboxKey,
    COMPOSE_PROFILES: 'postgresql', SERVER_WORKER_AMOUNT: '1', CELERY_WORKER_AMOUNT: '1',
    EXPOSE_NGINX_PORT: '127.0.0.1:5140', NGINX_SOCKET_IO_UPSTREAM: 'api:5001',
    CONSOLE_WEB_URL: 'http://127.0.0.1:5140', CONSOLE_API_URL: 'http://127.0.0.1:5140',
    SERVICE_API_URL: 'http://127.0.0.1:5140', APP_WEB_URL: 'http://127.0.0.1:5140',
    APP_API_URL: 'http://127.0.0.1:5140', TELEMETRY_ENABLED: 'false', CHECK_UPDATE_URL: '',
    // Only this Docker Desktop fixture destination is reachable through the trial proxy.
    SSRF_PROXY_ALLOW_PRIVATE_DOMAINS: 'host.docker.internal',
  }
  for (const [name, value] of Object.entries(settings)) {
    const pattern = new RegExp(`^${name}=.*$`, 'm')
    template = pattern.test(template) ? template.replace(pattern, `${name}=${value}`)
      : `${template}\n${name}=${value}`
  }
  writeFileSync(configPath, template, { mode: 0o600 })
  const limits = { api: '1g', worker: '1g', web: '384m', sandbox: '256m',
    plugin_daemon: '768m', db_postgres: '512m', redis: '128m', ssrf_proxy: '128m',
    nginx: '64m', init_permissions: '64m' }
  const selected = Object.fromEntries(services.map(name => {
    const service = source.services[name]
    service.restart = 'no'
    service.mem_limit = limits[name]
    if (service.env_file) service.env_file = [configPath]
    if (service.depends_on && !Array.isArray(service.depends_on)) {
      service.depends_on = Object.fromEntries(Object.entries(service.depends_on)
        .filter(([dependency]) => services.includes(dependency)))
    }
    delete service.ports
    if (name === 'api') service.ports = ['127.0.0.1:5141:5001']
    if (name === 'nginx') service.ports = ['127.0.0.1:5140:80']
    if (name === 'init_permissions') service.image = 'busybox:1.37'
    if (name === 'nginx') service.image = 'nginx:1.28-alpine'
    return [name, service]
  }))
  writeFileSync(composePath, YAML.stringify({ services: selected, networks: source.networks }), { mode: 0o600 })
  mkdirSync('output/chat-trial/evidence', { recursive: true })
  writeFileSync('output/chat-trial/evidence/dify-runtime.json', JSON.stringify({
    release: '1.17.1', commit: '8387590ace4a094de812b7847fc6a4c3a27cd52b',
    project, services, excluded: ['beta Agent', 'vector/RAG', 'collaboration'],
    ports: ['127.0.0.1:5140', '127.0.0.1:5141'], temporary: true,
  }, null, 2))
} else {
  const command = process.argv[2]
  if (!['up', 'stop', 'status'].includes(command)) throw new Error('Use prepare, up, stop or status')
  const args = ['compose', '--project-directory', root, '-p', project,
    '--env-file', configPath, '-f', composePath,
    ...(command === 'up' ? ['up', '-d'] : command === 'stop' ? ['down'] : ['ps', '--format', 'json'])]
  const result = spawnSync('docker', args, { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
}
