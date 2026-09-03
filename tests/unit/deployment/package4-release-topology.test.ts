import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), 'infra/package4')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Package 4 reusable release topology', () => {
  it('keeps the Formance origin private and admits only the Access service token', () => {
    const network = read('modules/release-environment/network.tf')
    const compute = read('modules/release-environment/compute.tf')
    const cloudflare = read('modules/release-environment/cloudflare.tf')

    expect(compute).toContain('associate_public_ip_address = false')
    expect(network).not.toContain('aws_vpc_security_group_ingress_rule" "k3s')
    expect(cloudflare).toContain('cloudflare_zero_trust_tunnel_cloudflared_config')
    expect(cloudflare).toContain('service_token = {')
    expect(cloudflare).toContain('decision         = "non_identity"')
    expect(cloudflare).toContain('service_auth_401_redirect = true')
    expect(cloudflare).toContain('http_status:404')
    expect(network).toContain('k3s_tunnel_tcp')
    expect(network).toContain('k3s_dns_udp')
  })

  it('uses managed PostgreSQL PITR and a separate encrypted regional copy', () => {
    const database = read('modules/release-environment/database.tf')
    const backup = read('modules/release-environment/backup.tf')
    const environment = read('environments/package4-release/versions.tf')

    expect(database).toContain('multi_az                   = true')
    expect(database).toContain('publicly_accessible        = false')
    expect(database).toContain('backup_retention_period    = 7')
    expect(database).toContain('deletion_protection        = true')
    expect(backup).toContain('copy_action {')
    expect(backup).toContain('delete_after = 7')
    expect(environment).toContain('region = "ap-southeast-4"')
  })

  it('pins the official OSS components and deploys only Gateway and Ledger', () => {
    const pins = read('modules/release-environment/locals.tf')
    const compute = read('modules/release-environment/compute.tf')
    const bootstrap = read('modules/release-environment/templates/bootstrap.sh.tftpl')

    for (const pin of ['3.9.6', 'v2.4.12@sha256:', 'v2.3.1@sha256:', 'cloudflared:2026.7.2@sha256:']) {
      expect(pins).toContain(pin)
    }
    expect(pins).toContain('k3s_install_script_sha')
    expect(pins).toContain('aws_cli_version')
    expect(pins).toContain('aws_cli_install_sha')
    expect(pins).toContain('awscli-exe-linux-aarch64')
    expect(bootstrap).toContain("'${aws_cli_install_url}'")
    expect(bootstrap).not.toMatch(/apt-get install[^\n]*awscli/u)
    expect(bootstrap).toContain('sha256sum --check --strict')
    expect(bootstrap).toContain('install -d -m 0700 /var/lib/rancher/k3s/server/manifests')
    expect(bootstrap).toContain('--cluster-cidr 10.244.0.0/16')
    expect(bootstrap).toContain('--service-cidr 10.245.0.0/16')
    expect(bootstrap).toContain('--cluster-dns 10.245.0.10')
    expect(bootstrap.indexOf('rollout status deployment/formance-operator')).toBeLessThan(
      bootstrap.indexOf('kind: Stack'),
    )
    expect(bootstrap.indexOf("kubectl get namespace '${stack_name}'")).toBeLessThan(
      bootstrap.indexOf("create secret generic cloudflare-tunnel-token"),
    )
    expect(bootstrap).toContain('createSecret: false')
    expect(bootstrap).toContain('for deployment in gateway ledger ledger-worker; do')
    expect(bootstrap.indexOf('get deployment "$deployment"')).toBeLessThan(
      bootstrap.indexOf('rollout status "deployment/$deployment"'),
    )
    expect(bootstrap).not.toContain('source-revision')
    expect(compute).not.toContain('source_revision              = var.source_revision')
    expect(bootstrap.match(/^kind: (Gateway|Ledger)$/gmu)?.sort()).toEqual(['kind: Gateway', 'kind: Ledger'])
    for (const excluded of ['kind: Payments', 'kind: Auth', 'kind: Wallets', 'kind: Reconciliation', 'kind: Webhooks']) {
      expect(bootstrap).not.toContain(excluded)
    }
    expect(bootstrap).toContain('key: ledger.schema-enforcement-mode')
    expect(bootstrap).toContain('value: strict')
    expect(bootstrap).toContain('key: ledger.experimental-features')
    expect(bootstrap).toContain('key: ledger.experimental-numscript')
  })

  it('keeps credentials outside committed examples and OpenTofu artifacts', () => {
    const example = read('environments/package4-release/package4-release.auto.tfvars.example')
    const ignore = read('.gitignore')

    expect(example).not.toMatch(/(?:password|client_secret|api_token)\s*=/u)
    expect(ignore).toContain('**/*.tfvars')
    expect(ignore).toContain('**/*.tfstate')
  })
})
