import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), 'infra/package4')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const cloudflareRoot = resolve(process.cwd(), 'infra/cloudflare/account-baseline')
const readCloudflare = (path: string) => readFileSync(resolve(cloudflareRoot, path), 'utf8')

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
    expect(environment).toMatch(/region\s*=\s*"ap-southeast-4"/u)
  })

  it('centralizes bounded host, database and network telemetry with actionable alarms', () => {
    const observability = read('modules/release-environment/observability.tf')
    const database = read('modules/release-environment/database.tf')
    const pins = read('modules/release-environment/locals.tf')
    const baseline = read('account-baseline/main.tf')

    expect(pins).toContain('cloudwatch_agent       = "1.300072.0b1766"')
    expect(observability).toContain('retention_in_days = 30')
    expect(baseline).toContain('id     = "vpc-flow-log-retention"')
    expect(baseline).toContain('days = 14')
    expect(observability).toContain('metric_name         = "disk_used_percent"')
    expect(observability).toContain('metric_name         = "mem_used_percent"')
    expect(observability).toContain('metric_name         = "CPUUtilization"')
    expect(observability).toContain('resource "aws_flow_log" "vpc"')
    expect(database).toContain('metric_name         = "FreeableMemory"')
    expect(database).toContain('alarm_name          = "${var.name}-rds-cpu"')
    expect(database).toContain('depends_on = [aws_cloudwatch_log_group.rds]')
  })

  it('declares account audit, safe defaults, runway controls and isolated production state', () => {
    const baseline = read('account-baseline/main.tf')
    const production = read('environments/production/main.tf')
    const productionBackend = read('environments/production/backend.hcl.example')
    const productionVariables = read('environments/production/variables.tf')

    expect(baseline).toContain('resource "aws_s3_account_public_access_block" "this"')
    expect(baseline).toContain('resource "aws_ebs_encryption_by_default" "this"')
    expect(baseline).toContain('is_multi_region_trail         = true')
    expect(baseline).toContain('enable_log_file_validation    = true')
    expect(baseline).toContain('resource "aws_guardduty_detector" "account"')
    expect(baseline).toContain('resource "aws_accessanalyzer_analyzer" "account"')
    expect(baseline).toContain('name         = "Agentic Economy USD 400 Runway"')
    expect(production).toContain('name                     = "ae-production"')
    expect(production).toContain('vpc_cidr                 = "10.43.0.0/16"')
    expect(production).toContain('formance_hostname        = "formance.aecon.ai"')
    expect(production).toContain('condition     = var.foundation_gates_passed')
    expect(production).toContain('depends_on = [terraform_data.foundation_gate]')
    expect(productionVariables).toMatch(/variable "foundation_gates_passed"[\s\S]*default\s*=\s*false/u)
    expect(productionBackend).toContain('agentic-economy-production-state-197716152388-ap-southeast-2')
    expect(productionBackend).toContain('alias/ae-production-opentofu-state')
  })

  it('isolates exactly two account-wide Cloudflare alert policies from runtime credentials', () => {
    const alerts = readCloudflare('main.tf')
    const variables = readCloudflare('variables.tf')
    const backend = readCloudflare('backend.hcl.example')

    expect(alerts.match(/resource "cloudflare_notification_policy"/gu)).toHaveLength(2)
    expect(alerts).toContain('alert_type  = "tunnel_health_event"')
    expect(alerts).toContain('alert_type  = "expiring_service_token_alert"')
    expect(alerts).toContain('email = [{ id = var.alert_email }]')
    expect(alerts).not.toContain('cloudflare_zero_trust_')
    expect(alerts).not.toContain('cloudflare_dns_record')
    expect(variables).toContain('default     = "joel@agentic-economy.ai"')
    expect(backend).toContain('agentic-economy/cloudflare/account-baseline/opentofu.tfstate')
  })

  it('refuses every AWS root outside the intended account', () => {
    for (const versionsPath of [
      'account-baseline/versions.tf',
      'environments/package4-release/versions.tf',
      'environments/production/versions.tf',
      'recovery-drill/versions.tf',
    ]) {
      expect(read(versionsPath)).toContain('allowed_account_ids = ["197716152388"]')
    }
  })

  it('restores into an isolated drill boundary without redirecting the source environment', () => {
    const drill = read('recovery-drill/main.tf')
    const verification = read('recovery-drill/verify-restored-formance.sh')
    const cleanup = read('recovery-drill/cleanup-restored-formance.sh')
    const drillReadme = read('recovery-drill/README.md')

    expect(drill).toMatch(/use_latest_restorable_time\s*=\s*true/u)
    expect(drill).toMatch(/publicly_accessible\s*=\s*false/u)
    expect(drill).toMatch(/multi_az\s*=\s*false/u)
    expect(drill).toMatch(/backup_retention_period\s*=\s*0/u)
    expect(drill).toContain('referenced_security_group_id = data.aws_security_group.k3s.id')
    expect(drill).toContain('resources = [aws_db_instance.drill.master_user_secret[0].secret_arn]')
    expect(verification).toContain('test "$source_schema_versions" = "$drill_schema_versions"')
    expect(verification).toContain('test "$source_transactions" = "$drill_transactions"')
    expect(verification).toContain('test "$source_balances" = "$drill_balances"')
    expect(verification).toContain('test "$probe_count" = "1"')
    expect(verification).toContain('scale deployment "$operator_deployment" --replicas=0')
    expect(verification).toContain('"POSTGRES_DATABASE=${source_namespace}-ledger"')
    expect(verification).toContain('restore_operator')
    expect(verification).toContain('trap restore_on_exit EXIT')
    expect(verification).toContain('^package4-release-restore-[0-9]{8}$')
    expect(cleanup).toContain('^package4-release-restore-[0-9]{8}$')
    expect(cleanup).toContain('--confirmed-by-joel')
    expect(cleanup).toContain('kubectl delete stack "$drill_name"')
    expect(cleanup).toContain('source_verification=PASS')
    expect(cleanup).not.toMatch(/kubectl delete[^\n]*package4-release(?:\s|$)/u)
    expect(drillReadme).toContain('Joel has explicitly')
    expect(drill).not.toContain('modify-db-instance')
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
