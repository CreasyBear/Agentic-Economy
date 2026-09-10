# Package 4 recovery drill

This root restores the latest restorable point of the synthetic Package 4 RDS
database into an isolated, private, single-AZ drill database. It adds only the
temporary network path and exact secret read needed by the existing private k3s
host. The authoritative database endpoint is never changed.

Use a dedicated state key per drill date. Plan and apply a saved plan, record
the latest restorable time immediately before the apply, then attach a Formance
stack whose name exactly matches the `drill_identifier` output. Compare schema,
transaction and balance digests with the source stack before running an
idempotent replay probe.

The operator derives both the logical PostgreSQL database and the `STACK`
selector from the Stack name. During verification, the script pauses only the
operator control loop, repoints the isolated drill Ledger deployments to the
restored source logical database, runs the proof, and restores the operator.
The authoritative source workloads and database endpoint remain unchanged.

Do not destroy the drill until the evidence is recorded and Joel has explicitly
confirmed cleanup. First run `cleanup-restored-formance.sh` on the k3s host with
the exact `package4-release-restore-YYYYMMDD` name and confirmation flag. It
rejects other targets and proves the source before and after removing the drill
Formance resources. Then review and apply a saved OpenTofu destroy plan for the
same dated state. Destruction removes the drill database, its managed secret,
temporary log group, security group rules and temporary instance-role grant.

The drill credential was exposed during the 2026-09-04 diagnostic and remains
an accepted isolated risk at Joel's direction. Do not retrieve or rotate it
during stabilisation. It must never be used by or copied into production.
