# Hosted cutover runbook

Migration and cutover steps that must run in order against a real Convex
deployment. Each entry lists the exact commands and the gate that has to be
green before the next dependent change lands.

## Well 0: Backup and schema tightening

1. Backup the deployment before any deletion:

   ```sh
   npx convex export --prod --path <backup>.zip
   ```

   Record the sha256 of the backup.

2. Deploy code and schema via the project's normal hosted deploy path. The
   tightened schema validates against empty prod market tables.

## Well 0: Retire external registry scheduled jobs

Cancel any pending instances of the three retired scheduled functions:

```sh
npx convex run --prod scheduledFunctionRetirement:cancelByName \
  '{"names":["marketRegistryGraduation:sweep","marketExternalRegistryRefresh:run","marketExternalRefresh:run"]}'
```

Expect `cancelled >= 0` on the first run, then `cancelled 0` on a second run.

## Well 0: Initialize directory index if catalogue is absent

Start the x402 directory scan only if `/api/v1/catalogue-status` is absent:

```sh
npx convex run --prod x402DirectoryIndexRefresh:start '{}'
```

## Well 0: Republish pre-searchText offerings

Publication rows created before `searchText` existed are not searchable. Republish
them through the owner supply path (there is no backfill; the one-off migration
was deleted by decision).

## Well 3: Rebuild business supply projections

Rebuild search documents to ensure hosted business search matches CLI/describe
results immediately:

```sh
npx convex run --prod capabilitySupplyProjection:rebuildAllBusinessSupplyProjections '{}'
```

Run this exactly once after deploy.

## Well 3: Sandbox deployment profile

Set nothing for the sandbox deployment profile — unset is a valid value.

## Wells 1+2: Stripe webhook destinations

Configure webhook destinations in both test and live modes:

```sh
npm run stripe:webhooks -- --mode test --apply
npm run stripe:webhooks -- --mode live --confirm-live --apply
```

## Wells 1+2: Environment variables for x402 sandbox reference

Set the following environment variables on the hosted deployment:

- `AE_SITE_URL` — the public origin (e.g. `https://agentic-economy.example.com`)
- `AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN` — x402 sandbox reference public endpoint origin
- `AE_PACKAGE5_FIXTURE_X402_PAY_TO` — x402 sandbox reference payment address

## Wells 1+2: Confirm treasury observation

Confirm that the treasury sensor runs once custody keys exist:

```sh
observe x402 treasury
```

This is a scheduled workload that runs every 15 minutes and records USDC balance
observations.

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
