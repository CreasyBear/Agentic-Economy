# Decide what must survive and how recovery will be proved

Type: grilling
Label: wayfinder:grilling
Status: resolved
Parent: ../map.md
Blocked by: 03

## Question

Given the actual record and environment inventory, which data and references must
survive byte-for-byte, which schema names may change, and what restore evidence
is needed before the cutover? Joel plans a full backup; establish its actual
scope and timing when available, not completion by assumption.

Cover the dirty source checkout, databases and related file storage, financial
records, external secret references, in-flight calls/OAuth/jobs, and records that
arrive during or after migration where present. A backup of one system does not
roll back an external payment. Define the smallest safe write pause and recovery
requirements from evidence; do not invent infrastructure or assume empty data.
No reset, export of secrets, production mutation or restore is authorised by
answering this ticket. Link the eventual backup/restore receipt without its data.

## Answer — accepted 2026-09-05

The [accepted plan](../../../docs/designs/vocabulary-rationalisation.md) chooses
a fresh development/test dataset after verified supported backup and restore,
not historical test-row migration. Preserve the dirty implemented source,
archived evidence, external financial history, storage/secret references and
protected opaque identifiers/hash/signature formats. No backup archive is
edited to simulate renamed tables. No production/mainnet or new Vercel project.

The [source baseline receipt](08-execution-baseline.md) proves private source
archive recovery only. The [operational preflight](../../../docs/operations/vocabulary-cutover-preflight.md)
has now found value-bearing hosted state: 20 pending funding commands, 18
carrying external/provider references. These are not disposable seed records.
Their external disposition must be reconciled before reset, with no payment,
webhook or queued-work replay. A database restore cannot undo an external
payment. Callback/job isolation and maintenance-window accounting remain
required even when a queue census is empty.

Issue 31 stays open for fresh Convex backup/restore and exact isolation/rollback
proof. Local data recovery and hosted financial recovery are separate gates;
source work may proceed independently. Rollback restores matched previous
app/backend/data state only after reconciling any new external financial effects.

This resolves the preservation strategy approved by Joel; it does not claim
that the database backup, restoration or destructive cutover has occurred.
