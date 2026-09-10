# Hosted cutover runbook

Migration and cutover steps that must run in order against a real Convex
deployment. Each entry lists the exact commands and the gate that has to be
green before the next dependent change lands.

## C14 -> C15: retire `capabilityOfferings.presentation.price` (Well 4, D7)

C14 made `presentation.price` optional in the schema (validator only; see
`src/modules/capability-supply/internal/convex-schema.ts`) and registered a
`@convex-dev/migrations` backfill, `migrations:removeOfferingPrice`, that
unsets `price` on every `capabilityOfferings` row. C15 (a separate, later
change) drops the now-unused optional field from the validator entirely.
**C15 must not land until the production document count below reads 0** -
tightening the validator while priced rows still exist would reject those
rows on the next deploy.

1. Dry-run on dev first, to see what the batch would touch without
   committing anything:

   ```sh
   npx convex run migrations:removeOfferingPrice '{"dryRun": true}'
   ```

2. Run the migration on dev to completion:

   ```sh
   npx convex run migrations:removeOfferingPrice
   ```

3. Repeat steps 1-2 against prod once dev is verified:

   ```sh
   npx convex run migrations:removeOfferingPrice '{"dryRun": true}' --prod
   npx convex run migrations:removeOfferingPrice --prod
   ```

4. Document-count check (prod) - confirm the migration has actually
   finished and processed every row before treating C15 as unblocked:

   ```sh
   npx convex run --component migrations lib:getStatus '{"names": ["migrations:removeOfferingPrice"]}' --prod
   ```

   Read `isDone: true` and `processed` (the total document count the
   migration walked) off the returned status. Only once this reads done
   against prod, with no `error`, is the production count of un-migrated
   `presentation.price` rows 0 and C15 (making `price` disappear from the
   validator) safe to deploy.
