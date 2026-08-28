import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { makeFunctionReference } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "../../convex/schema";
import {
  AUTHORITY_REGISTRAR_MODES,
  AuthorityEntryDeniedError,
} from "../../convex/lib/authorityRegistrars";
import { convexModules, ownerAdmin } from "../helpers/convex-fixtures";

const fixtureModules = Object.fromEntries(
  Object.entries(
    import.meta.glob(
      "../fixtures/phase-2-authority-entry-foundation/registered.ts",
    ),
  ).map(([path, load]) => [
    path.replace("../fixtures/phase-2-authority-entry-foundation/", "./"),
    load,
  ]),
);
const modules = { ...convexModules, ...fixtureModules };

const ordinaryQuery = makeFunctionReference<
  "query",
  { accountRef: string; value: string },
  string
>("registered:ordinaryQuery");
const genericQuery = makeFunctionReference<
  "query",
  { accountRef: string; value: string },
  string
>("registered:genericQuery");
const ordinaryMutation = makeFunctionReference<
  "mutation",
  { accountRef: string; value: string },
  string
>("registered:ordinaryMutation");
const genericMutation = makeFunctionReference<
  "mutation",
  { accountRef: string; value: string },
  string
>("registered:genericMutation");
const ordinaryAction = makeFunctionReference<
  "action",
  { accountRef: string; value: string },
  string
>("registered:ordinaryAction");
const genericAction = makeFunctionReference<
  "action",
  { accountRef: string; value: string },
  string
>("registered:genericAction");
const ordinaryInternalQuery = makeFunctionReference<
  "query",
  { accountRef: string; value: string },
  string
>("registered:ordinaryInternalQuery");
const ordinaryInternalMutation = makeFunctionReference<
  "mutation",
  { accountRef: string; value: string },
  string
>("registered:ordinaryInternalMutation");
const ordinaryInternalAction = makeFunctionReference<
  "action",
  { accountRef: string; value: string },
  string
>("registered:ordinaryInternalAction");
const genericInternalQuery = makeFunctionReference<
  "query",
  { accountRef: string; value: string },
  string
>("registered:genericInternalQuery");
const genericInternalMutation = makeFunctionReference<
  "mutation",
  { accountRef: string; value: string },
  string
>("registered:genericInternalMutation");
const genericInternalAction = makeFunctionReference<
  "action",
  { accountRef: string; value: string },
  string
>("registered:genericInternalAction");
const publicProjection = makeFunctionReference<
  "query",
  { value: string },
  string
>("registered:publicProjection");
const publicProjectionGeneric = makeFunctionReference<
  "query",
  { value: string },
  string
>("registered:publicProjectionGeneric");
const narrowSystemRead = makeFunctionReference<
  "query",
  { literalTarget: "foundation:narrow-system" },
  string
>("registered:narrowSystemRead");
const narrowSystem = makeFunctionReference<
  "mutation",
  { literalTarget: "foundation:narrow-system" },
  string
>("registered:narrowSystem");
const narrowSystemEffect = makeFunctionReference<
  "action",
  { literalTarget: "foundation:narrow-system" },
  string
>("registered:narrowSystemEffect");
const developmentOnly = makeFunctionReference<
  "mutation",
  { literalTarget: "foundation:development" },
  string
>("registered:developmentOnly");

const AUTHORITY_CASE_LABELS = [
  "owner",
  "member",
  "workload",
  "missing_workload",
  "stranger",
  "wrong_account",
  "stale_generation",
] as const;

describe("Phase 2 authority registrar foundation", () => {
  it("keeps protected, public, system, and development modes finite and distinct", () => {
    expect(AUTHORITY_REGISTRAR_MODES).toEqual([
      "protected_interactive_principal_account",
      "protected_agent_delegation_generation",
      "protected_signed_callback_provenance",
      "protected_durable_workload",
      "protected_workload_account",
      "public_read_exemption",
      "narrow_system_exemption",
      "dev_only_exemption",
    ]);
    expect(new Set(AUTHORITY_REGISTRAR_MODES)).toHaveLength(8);
  });

  it("drives public, narrow-system, and development literal registrars through distinct actual refs", async () => {
    const backend = convexTest(schema, modules);
    await expect(
      backend.query(publicProjection, { value: "public-byte-parity" }),
    ).resolves.toBe("public-byte-parity");
    await expect(
      backend.query(publicProjectionGeneric, {
        value: "public-generic-parity",
      }),
    ).resolves.toBe("public-generic-parity");
    await expect(
      backend.query(narrowSystemRead, {
        literalTarget: "foundation:narrow-system",
      }),
    ).resolves.toBe("narrow_system_exemption:foundation:narrow-system");
    await expect(
      backend.mutation(narrowSystem, {
        literalTarget: "foundation:narrow-system",
      }),
    ).resolves.toBe("narrow_system_exemption:foundation:narrow-system");
    await expect(
      backend.action(narrowSystemEffect, {
        literalTarget: "foundation:narrow-system",
      }),
    ).resolves.toBe("narrow_system_exemption:foundation:narrow-system");
    await expect(
      backend.mutation(developmentOnly, {
        literalTarget: "foundation:development",
      }),
    ).resolves.toBe("dev_only_exemption:foundation:development");
  });

  it("drives ordinary and Generic public/internal registrations through actual refs with wire parity", async () => {
    const backend = convexTest(schema, modules);
    const owner = await ownerAdmin(backend, "user_foundation_owner");
    const authority = await canonicalAuthorityFor(
      backend,
      "user_foundation_owner",
    );
    const args = { accountRef: authority.accountRef, value: "unchanged" };

    await expect(owner.query(ordinaryQuery, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.query(genericQuery, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.mutation(ordinaryMutation, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.mutation(genericMutation, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.action(ordinaryAction, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.action(genericAction, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.query(ordinaryInternalQuery, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.mutation(ordinaryInternalMutation, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.action(ordinaryInternalAction, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.query(genericInternalQuery, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.mutation(genericInternalMutation, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
    await expect(owner.action(genericInternalAction, args)).resolves.toBe(
      `${authority.accountRef}:unchanged`,
    );
  });

  it("evaluates all seven authority/isolation labels through actual registered handlers", async () => {
    expect(AUTHORITY_CASE_LABELS).toEqual([
      "owner",
      "member",
      "workload",
      "missing_workload",
      "stranger",
      "wrong_account",
      "stale_generation",
    ]);
    const backend = convexTest(schema, modules);
    const owner = await ownerAdmin(backend, "user_foundation_matrix_owner");
    const ownerAuthority = await canonicalAuthorityFor(
      backend,
      "user_foundation_matrix_owner",
    );
    const member = await moveIdentityToMembership(
      backend,
      "user_foundation_matrix_member",
      ownerAuthority.accountRef,
    );
    const workload = await ownerAdmin(
      backend,
      "user_foundation_matrix_workload",
    );
    await backend.run(async (ctx) => {
      const binding = await ctx.db
        .query("externalIdentityBindings")
        .withIndex("by_providerNamespace_and_providerIdentifier", (query) =>
          query
            .eq("providerNamespace", "clerk/user")
            .eq("providerIdentifier", "token_foundation_matrix_workload"),
        )
        .unique();
      if (binding === null)
        throw new Error("workload fixture binding missing");
      const principal = await ctx.db
        .query("principals")
        .withIndex("by_principalRef", (query) =>
          query.eq("principalRef", binding.principalRef),
        )
        .unique();
      if (principal === null)
        throw new Error("workload fixture principal missing");
      await ctx.db.patch(principal._id, { kind: "workload" });
    });
    const args = { accountRef: ownerAuthority.accountRef, value: "matrix" };

    await expect(owner.query(ordinaryQuery, args)).resolves.toBe(
      `${ownerAuthority.accountRef}:matrix`,
    );
    await expect(member.query(ordinaryQuery, args)).resolves.toBe(
      `${ownerAuthority.accountRef}:matrix`,
    );
    await expect(workload.query(ordinaryQuery, args)).rejects.toThrow(
      AuthorityEntryDeniedError,
    );
    await expect(backend.query(ordinaryQuery, args)).rejects.toThrow(
      AuthorityEntryDeniedError,
    );
    await expect(
      backend
        .withIdentity({
          subject: "user_matrix_stranger",
          issuer: "https://identity.example",
          tokenIdentifier: "token_matrix_stranger",
        })
        .query(ordinaryQuery, args),
    ).rejects.toThrow(AuthorityEntryDeniedError);
    await expect(
      owner.query(ordinaryQuery, {
        ...args,
        accountRef: `acc_${"e".repeat(32)}`,
      }),
    ).rejects.toThrow("authority_entry_wrong_account");
    await staleInteractiveCredential(backend, "user_foundation_matrix_owner");
    await expect(owner.query(ordinaryQuery, args)).rejects.toThrow(
      AuthorityEntryDeniedError,
    );
  });

  it("fails closed before handlers for missing identity, stranger, wrong Account, and stale generation", async () => {
    const backend = convexTest(schema, modules);
    const owner = await ownerAdmin(backend, "user_foundation_denials");
    const authority = await canonicalAuthorityFor(
      backend,
      "user_foundation_denials",
    );
    const valid = { accountRef: authority.accountRef, value: "must-not-leak" };

    await expect(backend.query(ordinaryQuery, valid)).rejects.toThrow(
      AuthorityEntryDeniedError,
    );
    await expect(
      backend
        .withIdentity({
          subject: "user_stranger",
          issuer: "https://identity.example",
          tokenIdentifier: "token_stranger",
        })
        .query(ordinaryQuery, valid),
    ).rejects.toThrow(AuthorityEntryDeniedError);
    await expect(
      owner.query(ordinaryQuery, {
        ...valid,
        accountRef: `acc_${"f".repeat(32)}`,
      }),
    ).rejects.toThrow("authority_entry_wrong_account");

    await backend.run(async (ctx) => {
      const credential = await ctx.db
        .query("credentials")
        .withIndex("by_credentialRef", (query) =>
          query.eq("credentialRef", authority.credentialRef),
        )
        .unique();
      if (credential === null) throw new Error("fixture credential missing");
      await ctx.db.patch(credential._id, {
        lifecycle: "stale",
        staleAt: Date.now(),
      });
    });
    await expect(owner.query(ordinaryQuery, valid)).rejects.toThrow(
      AuthorityEntryDeniedError,
    );
  });

  it("keeps the public read registrar identity-independent and result-compatible", async () => {
    const backend = convexTest(schema, modules);
    await expect(
      backend.query(publicProjection, { value: "public-byte-parity" }),
    ).resolves.toBe("public-byte-parity");
  });

  it("preserves the hostile fixture corpus for the driver-owned ESLint code-path gate", async () => {
    const fixtureNames = [
      "alternate-branch.ts",
      "catch-finally.ts",
      "dynamic-target.ts",
      "dynamic-mode.ts",
      "dynamic-registrar-selection.ts",
      "early-return.ts",
      "escaped-handler.ts",
      "factory.ts",
      "pre-boundary-capabilities.ts",
      "protected-alias-capability.ts",
      "protected-context-escape.ts",
      "protected-db-alias.ts",
      "protected-db-write.ts",
      "protected-escaped-handler.ts",
      "protected-factory-capability.ts",
      "protected-fetch.ts",
      "protected-fetch-alias.ts",
      "protected-global-fetch.ts",
      "protected-run-action.ts",
      "protected-run-mutation-allowed-dynamic-target.ts",
      "protected-run-mutation-allowed-literal-target.ts",
      "protected-run-mutation-dynamic-target.ts",
      "protected-run-mutation-unlisted-literal-target.ts",
      "protected-run-query.ts",
      "protected-scheduler.ts",
      "safe-all-path.ts",
      "typed.ts",
      "alias.ts",
      "unchecked-args.ts",
    ];
    const sources = await Promise.all(
      fixtureNames.map(
        async (name) =>
          await readFile(
            fileURLToPath(
              new URL(
                `../fixtures/phase-2-authority-entry-foundation/${name}`,
                import.meta.url,
              ),
            ),
            "utf8",
          ),
      ),
    );
    expect(sources).toHaveLength(29);
    expect(sources.join("\n")).toContain("effect-before-authority");
    expect(sources.join("\n")).toContain("protectedInteractiveQuery");
  });
});

async function canonicalAuthorityFor(
  backend: TestConvex<typeof schema>,
  subject: string,
): Promise<{ accountRef: string; credentialRef: string }> {
  return await backend.run(async (ctx) => {
    const tokenIdentifier = subject.replace(/^user_/u, "token_");
    const binding = await ctx.db
      .query("externalIdentityBindings")
      .withIndex("by_providerNamespace_and_providerIdentifier", (query) =>
        query
          .eq("providerNamespace", "clerk/user")
          .eq("providerIdentifier", tokenIdentifier),
      )
      .unique();
    if (binding === null) throw new Error("fixture canonical binding missing");
    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_bindingRef_and_generation_and_lifecycle", (query) =>
        query
          .eq("bindingRef", binding.bindingRef)
          .eq("generation", binding.credentialGeneration)
          .eq("lifecycle", "active"),
      )
      .unique();
    if (credential === null) throw new Error("fixture credential missing");
    const ownership = await ctx.db
      .query("accountOwnerships")
      .withIndex("by_ownerPrincipalRef_and_lifecycle", (query) =>
        query
          .eq("ownerPrincipalRef", binding.principalRef)
          .eq("lifecycle", "active"),
      )
      .unique();
    if (ownership === null) throw new Error("fixture canonical account missing");
    return { accountRef: ownership.accountRef, credentialRef: credential.credentialRef };
  });
}

async function moveIdentityToMembership(
  backend: TestConvex<typeof schema>,
  subject: string,
  targetAccountRef: string,
) {
  const member = await ownerAdmin(backend, subject);
  await backend.run(async (ctx) => {
    const tokenIdentifier = subject.replace(/^user_/u, "token_");
    const binding = await ctx.db
      .query("externalIdentityBindings")
      .withIndex("by_providerNamespace_and_providerIdentifier", (query) =>
        query
          .eq("providerNamespace", "clerk/user")
          .eq("providerIdentifier", tokenIdentifier),
      )
      .unique();
    if (binding === null) throw new Error("member fixture binding missing");
    const memberPrincipalRef = binding.principalRef;
    const oldOwnership = await ctx.db
      .query("accountOwnerships")
      .withIndex("by_ownerPrincipalRef_and_lifecycle", (query) =>
        query
          .eq("ownerPrincipalRef", memberPrincipalRef)
          .eq("lifecycle", "active"),
      )
      .unique();
    if (oldOwnership === null)
      throw new Error("member fixture ownership missing");
    const memberAccountRef = oldOwnership.accountRef;
    await ctx.db.patch(oldOwnership._id, {
      lifecycle: "ended",
      endedAt: 2,
      endedBy: {
        actorPrincipalRef: memberPrincipalRef,
        activeAccountRef: memberAccountRef,
        correlationRef: `member:${subject}`,
        idempotencyRef: `member:${subject}`,
      },
    });
    await ctx.db.insert("memberships", {
      membershipRef: `mem_${subject
        .padEnd(32, "0")
        .slice(0, 32)
        .replaceAll(/[^0-9a-f]/gu, "a")}`,
      accountRef: targetAccountRef,
      memberPrincipalRef,
      lifecycle: "active",
      revision: 1,
      createdAt: 2,
      createdBy: {
        actorPrincipalRef: memberPrincipalRef,
        activeAccountRef: targetAccountRef,
        correlationRef: `member:${subject}`,
        idempotencyRef: `member:${subject}`,
      },
    });
  });
  return member;
}

async function staleInteractiveCredential(
  backend: TestConvex<typeof schema>,
  subject: string,
): Promise<void> {
  const authority = await canonicalAuthorityFor(backend, subject);
  await backend.run(async (ctx) => {
    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_credentialRef", (query) =>
        query.eq("credentialRef", authority.credentialRef),
      )
      .unique();
    if (credential === null) throw new Error("fixture credential missing");
    await ctx.db.patch(credential._id, {
      lifecycle: "stale",
      staleAt: Date.now(),
    });
  });
}
