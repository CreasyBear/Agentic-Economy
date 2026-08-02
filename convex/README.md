# Convex backend

`schema.ts` composes the bounded-context tables exported from `src/modules/**/internal/schema.ts`.
Catalog supply is Offering-owned: `businessOfferings`, `businessOfferingRevisions`, and
`offeringAccessPaths` are the durable source; `businessSupplyProjectionSnapshots` is the
public read projection. The retired BusinessService and service-capability child tables
are not part of the schema.

Run `npm run check:convex-codegen` after changing a table or public Convex contract.
