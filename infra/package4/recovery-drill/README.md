# Package 4 recovery drill

This root restores a **recorded UTC point** of the selected source RDS
instance into a separate private, single-AZ database. It adds only the temporary
network path and exact secret read needed by the existing private k3s host.
The authoritative database endpoint is never changed. Applying this root creates
billable AWS resources; use the existing approved drill scope and a reviewed,
saved plan. Source preparation, provisioning and cleanup are separate operations.

Select the existing source namespace and ledger explicitly. The namespace must
match Terraform's `source_environment`; the source RDS instance is
`<source_environment>-formance`. The observed alpha pair is `ae-alpha` and
`agentic-economy-alpha`; the historical release pair is `package4-release` and
`agentic-economy-release`. Verify the live binding before capture. This selection
does not provision a production ledger or change the source's environment.

The examples use the existing alpha source. Set these values in each terminal:

```sh
source_namespace=ae-alpha
source_ledger=agentic-economy-alpha
drill_date=20261002
drill_name="${source_namespace}-restore-${drill_date}"
```

**Requires:** valid source identifiers, a drill name consisting of that exact
namespace plus `-restore-YYYYMMDD`, and a matching baseline ledger/cutoff.
**Ensures:** verification uses the named, distinct restored RDS instance;
cleanup deletes only resources named for that drill. **Invariant:** source
workloads and the authoritative endpoint are not redirected or deleted.
**On violation:** exit nonzero before secret access or workload mutation.
Operational failures remain failures; PASS requires successful completion and,
for verification, operator restoration.

## Capture a coherent baseline

1. Quiesce and drain **all** source Formance writers: accepted Calls, funding
   webhooks, refunds, recovery/scheduled workers and operator mutations. Payment
   admission pause alone is insufficient. Record the controls used and outstanding
   work. Keep reads available. Do not claim quiescence from two equal reads.
2. Retain an existing, unreverted **original canonical AE command** as a private
   JSON file: `commandRef`, `idempotencyKey`, `schemaVersion`, `template`,
   `variables`, `metadata`. Use the original command, or reproduce it from its
   immutable booking using the same maintained preparation function/revision.
   For funding, that is `prepareFormanceFundingSettlement`; do not infer inputs
   from postings, choose a fresh key or create a recovery probe. Preserve the
   provenance of this file with the drill evidence; do not commit it.
3. On the private k3s host, use the accepted source revision, installed repository
   dependencies, Node 22 and npm 11.5.1. In a separate terminal, forward the source
   gateway to a dedicated loopback port:

   ```sh
   export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
   kubectl -n "$source_namespace" port-forward --address 127.0.0.1 service/gateway 18081:8080
   ```

4. From the repository root, capture the baseline using absolute private paths:

   ```sh
   npm exec --no -- tsx tools/release/formance-restore.ts capture \
     --gateway http://127.0.0.1:18081 \
     --ledger "$source_ledger" \
     --command-file /secure/drill/original-command.json \
     --baseline /secure/drill/baseline.json
   ```

   The CLI fully scans transactions, accounts with signed volumes, schema content
   and ledger configuration twice, with `restoreTime` between the reads. Drift,
   malformed/missing pages, looping cursors, unsupported numeric precision or scan
   limits fail capture. A baseline is created with mode 0600 and never overwritten.
   It contains counts/digests, cutoff and command/transaction identity, not raw
   financial rows or credentials. Keep it and the original command access restricted.
5. Copy the exact `restoreTime` from that baseline into the required `restore_time`
   Terraform variable. While writers remain quiesced, wait until RDS reports
   `LatestRestorableTime >= restore_time`; record the source DB identity, retained
   backup window, baseline checksum and that observation. AWS exposes this through
   [`describe-db-instances`](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html).
   No later source state is used as the restore comparator. Writers may resume
   once the fixed cutoff is confirmed restorable and the drill records are retained.

## Restore and verify

Use a dedicated state key per source and drill date, such as
`agentic-economy/ae-alpha/recovery-drills/20261002.tfstate`. Supply
`source_environment=ae-alpha` and `drill_date=20261002` for that state; do not
reuse the backend example's historical release state. Review and apply a saved
plan with the exact `restore_time`. Record the restored DB ARN/endpoint and the
executed plan;
a requested timestamp alone is not evidence that a restore completed. Do not use
`use_latest_restorable_time`, overwrite production, or reuse a prior baseline.

Run the verifier on the private k3s host from the matching checkout. Supply the
`drill_identifier`, `drill_endpoint`, `drill_secret_arn` and `restore_time` outputs
from that same state:

```sh
infra/package4/recovery-drill/verify-restored-formance.sh \
  "$source_namespace" "$source_ledger" "$drill_name" \
  '<restored database endpoint>' '<restored database secret ARN>' \
  /secure/drill/baseline.json /secure/drill/original-command.json \
  '<restore_time output>' ap-southeast-2
```

Before retrieving a secret or creating a workload, the verifier reads the named
RDS instance and binds its ARN, endpoint and managed secret to the supplied drill.
It requires a private, encrypted, available database distinct from the source.
The temporary role grant permits these metadata reads only for those two instances.

The operator derives both the logical PostgreSQL database and the `STACK`
selector from the Stack name. The script attaches the isolated drill stack,
pauses only the operator control loop while selecting the restored source logical
database, and forwards that **drill** gateway to loopback port 18082. It compares
against the saved baseline, checks the application retry, and submits two native
retries with the original command/key/schema. Both must return the original
native transaction ID; two further complete scans must remain identical. A 409
alone never passes. No `force=true` request or fresh probe ledger is used.

The script restores the operator and removes its own port-forward on success or
failure. It emits PASS only after successful verification and operator restoration;
require both PASS and exit status zero. Keep financial entry suspended if operator
restoration fails. Save the counts/digests and replay ID, source/target identities,
backup cutoff, source revision, RPO/RTO and any discrepancy. Equal scans demonstrate
observed stability, not an atomic snapshot or independent evidence of quiescence.

The reader accepts at most 100,000 total records and 1,000 schemas, 250 records per
page, 8 MiB per response and 120 seconds per scan. Unsafe wire integers are refused;
exact raw timestamp strings and native fields are retained for comparison before
SDK normalization. Exceeding a bound is incomplete evidence, never a partial PASS.
This proves the selected Formance ledger's exposed financial state and native
retry behavior. Convex data, File Storage, code/schema/configuration and
cross-system post-backup reconciliation need their separate restore proof.

## Local regression proof

The opt-in `tests/integration/money-formance-restore.test.ts` uses the existing
pinned native Compose stack. Start source project `ae-restore-proof-source` on
3179 and target project `ae-restore-proof-target` on 3182 with **PostgreSQL only**.
The test owns no shared stack; it backs up source PostgreSQL, restores the empty
target, then starts target Ledger/Gateway. It exercises more than 1,000 canonical
transactions, original native replay and deliberate drift. Root commands:

```sh
AE_NATIVE_MONEY_PORT=3179 docker compose -p ae-restore-proof-source -f tests/config/native-money/compose.yml up -d --wait
AE_NATIVE_MONEY_PORT=3182 docker compose -p ae-restore-proof-target -f tests/config/native-money/compose.yml up -d --wait postgres
AE_FORMANCE_RESTORE_INTEGRATION=true npm exec --no -- node tools/dev/run-listed-vitest.ts tests/integration/money-formance-restore.test.ts
```

Use fresh empty project volumes for each run and remove only these disposable
projects after acceptance. The test intentionally changes the restored fixture;
it must never be pointed at an existing database or ordinary development stack.

## Cloud cleanup

Do not destroy the cloud drill until evidence is recorded and Joel has explicitly
confirmed cleanup. First run `cleanup-restored-formance.sh` on the k3s host with
the same source, ledger and dated drill name:

```sh
infra/package4/recovery-drill/cleanup-restored-formance.sh \
  "$source_namespace" "$source_ledger" "$drill_name" --confirmed-by-joel
```

It rejects other targets and proves source health before and after removing drill
Formance resources. It can safely resume after a partial cleanup or repeat after
the namespace is already gone: the exact named deletes still remove any remaining
Settings or Versions, and a failed operation never emits PASS.
Namespace verification accepts an explicit not-found result; Kubernetes lookup
errors remain failures.
Then review and apply a saved OpenTofu destroy plan for the
same dated state. Destruction removes the drill database, its managed secret,
temporary log group, security group rules and temporary instance-role grant.

The drill credential exposed during the 2026-09-04 diagnostic remains an accepted
isolated risk at Joel's direction. Do not retrieve or rotate that earlier drill's
credential during stabilisation. Never use or copy it into production.
