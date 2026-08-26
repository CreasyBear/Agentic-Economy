import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

type RegistrationKind =
  | "query"
  | "mutation"
  | "action"
  | "internalQuery"
  | "internalMutation"
  | "internalAction"
  | "httpAction"
  | "queryGeneric"
  | "mutationGeneric"
  | "internalQueryGeneric"
  | "internalMutationGeneric"
  | "httpActionGeneric";

type InventoryRow = {
  id: string;
  file: string;
  exportName: string;
  registrationKind: RegistrationKind;
  visibility: "public" | "internal" | "http";
  builder: {
    canonicalName: RegistrationKind;
    canonicalModule: string;
    resolution: "direct" | "import_alias" | "local_alias" | "factory";
  };
  registrarSymbolId: string;
  declarationSha256: string;
  initializerSha256: string;
  sourceSpan: { start: number; end: number };
  symbolId: string;
};

type InventoryCounts = {
  direct: number;
  files: number;
  public: number;
  internal: number;
  http: number;
  ordinary: number;
  generic: number;
  aliases: number;
  factories: number;
  unresolved: number;
  duplicate: number;
};

type Inventory = {
  schemaVersion: number;
  analysisScope: "registration_identity_only";
  rows: InventoryRow[];
  unresolved: unknown[];
  duplicates: unknown[];
  counts: InventoryCounts;
  digest: string;
};

type InventoryModule = {
  collectConvexRegistrationInventory: (options: {
    projectPath: string;
  }) => Inventory | Promise<Inventory>;
  validateConvexRegistrationInventory: (
    candidate: Inventory,
    options?: {
      requireClassified?: boolean;
      classifications?: unknown;
      runtimeSurfaceRefs?: Iterable<string>;
      runtimeRows?: Array<{ id: string; registrationIds: string[] }>;
    },
  ) =>
    | {
        ok: boolean;
        diagnostics: Array<{ code: string; rowId?: string; message: string }>;
        counts: InventoryCounts;
      }
    | Promise<{
        ok: boolean;
        diagnostics: Array<{ code: string; rowId?: string; message: string }>;
        counts: InventoryCounts;
      }>;
};

const fixturePath = (name: string) =>
  fileURLToPath(
    new URL(
      `../fixtures/phase-2-convex-registration-migration/${name}`,
      import.meta.url,
    ),
  );

async function loadInventoryModule(): Promise<InventoryModule> {
  const modulePath = fileURLToPath(
    new URL(
      "../../tools/maturity/phase-2-convex-registration-migration.mjs",
      import.meta.url,
    ),
  );
  return (await import(pathToFileURL(modulePath).href)) as InventoryModule;
}

async function classifiedFixture(
  inventory: Inventory,
  runtimeRef = "runtime:fixture",
) {
  const sourcePath =
    "tests/fixtures/phase-2-convex-registration-migration/enumeration.ts";
  const source = await readFile(fixturePath("enumeration.ts"));
  const document = {
    format: "phase-2-convex-registration-classifications:v1",
    inventoryDigest: inventory.digest,
    sourceDigests: {
      [sourcePath]: createHash("sha256").update(source).digest("hex"),
    },
    rows: Object.fromEntries(
      inventory.rows.map((row) => [
        row.id,
        {
          adapterMode: "protected_interactive_account",
          baselineDigests: {
            declarationSha256: row.declarationSha256,
            initializerSha256: row.initializerSha256,
            registrarSymbolId: row.registrarSymbolId,
            symbolId: row.symbolId,
          },
          binding: "interactive_account",
          classification: "protected",
          edgeRefs: [],
          handlerContract: {
            capabilities: ["read"],
            closureClass: "inline",
            location: row.id,
          },
          migrationObligations: [],
          ownedFile: row.file,
          ownerLeaf: "fixture-owner",
          policyReference: "fixture-policy",
          rollbackUnit: row.file,
          runtimeRefs: [runtimeRef],
          testCases: ["fixture actual-registration test"],
          unresolvedReasons: [],
        },
      ]),
    ),
  };
  return {
    ...document,
    contractDigest: createHash("sha256")
      .update(`${JSON.stringify(document)}\n`)
      .digest("hex"),
  };
}

const temporaryProjects: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryProjects.map((projectPath) =>
      rm(projectPath, { force: true, recursive: true }),
    ),
  );
});

describe("Phase 2 Convex registration migration inventory", () => {
  it("enumerates ordinary, Generic, and typed registrations by canonical symbol identity", async () => {
    const { collectConvexRegistrationInventory } = await loadInventoryModule();
    const inventory = await collectConvexRegistrationInventory({
      projectPath: fixturePath("tsconfig.enumeration.json"),
    });

    expect(inventory.analysisScope).toBe("registration_identity_only");
    expect(inventory.counts).toEqual({
      aliases: 0,
      direct: 12,
      duplicate: 0,
      factories: 0,
      files: 1,
      generic: 5,
      http: 2,
      internal: 5,
      ordinary: 7,
      public: 5,
      unresolved: 0,
    });
    expect(
      inventory.rows.map(({ exportName, registrationKind, visibility }) => ({
        exportName,
        registrationKind,
        visibility,
      })),
    ).toEqual([
      {
        exportName: "directGenericHttpAction",
        registrationKind: "httpActionGeneric",
        visibility: "http",
      },
      {
        exportName: "directGenericInternalMutation",
        registrationKind: "internalMutationGeneric",
        visibility: "internal",
      },
      {
        exportName: "directGenericInternalQuery",
        registrationKind: "internalQueryGeneric",
        visibility: "internal",
      },
      {
        exportName: "directGenericMutation",
        registrationKind: "mutationGeneric",
        visibility: "public",
      },
      {
        exportName: "directGenericQuery",
        registrationKind: "queryGeneric",
        visibility: "public",
      },
      {
        exportName: "directHttpAction",
        registrationKind: "httpAction",
        visibility: "http",
      },
      {
        exportName: "directInternalAction",
        registrationKind: "internalAction",
        visibility: "internal",
      },
      {
        exportName: "directInternalMutation",
        registrationKind: "internalMutation",
        visibility: "internal",
      },
      {
        exportName: "directInternalQuery",
        registrationKind: "internalQuery",
        visibility: "internal",
      },
      {
        exportName: "directMutation",
        registrationKind: "mutation",
        visibility: "public",
      },
      {
        exportName: "directQuery",
        registrationKind: "query",
        visibility: "public",
      },
      {
        exportName: "typedAction",
        registrationKind: "action",
        visibility: "public",
      },
    ]);
    expect(
      inventory.rows.every(
        (row) =>
          row.id.length > 0 &&
          !row.file.startsWith("/") &&
          row.builder.canonicalModule.length > 0 &&
          row.registrarSymbolId.length > 0 &&
          /^[a-f0-9]{64}$/.test(row.declarationSha256) &&
          /^[a-f0-9]{64}$/.test(row.initializerSha256) &&
          row.sourceSpan.start >= 0 &&
          row.sourceSpan.end > row.sourceSpan.start &&
          row.symbolId.length > 0,
      ),
    ).toBe(true);
    expect(inventory.unresolved).toEqual([]);
    expect(inventory.duplicates).toEqual([]);
    expect(inventory.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("resolves imported aliases, local aliases, and bounded registrar factories", async () => {
    const { collectConvexRegistrationInventory } = await loadInventoryModule();
    const inventory = await collectConvexRegistrationInventory({
      projectPath: fixturePath("tsconfig.aliases.json"),
    });

    expect(
      inventory.rows.map(({ exportName, registrationKind, builder }) => ({
        canonicalName: builder.canonicalName,
        exportName,
        registrationKind,
        resolution: builder.resolution,
      })),
    ).toEqual([
      {
        canonicalName: "query",
        exportName: "fromImportedAlias",
        registrationKind: "query",
        resolution: "import_alias",
      },
      {
        canonicalName: "mutationGeneric",
        exportName: "fromLocalAlias",
        registrationKind: "mutationGeneric",
        resolution: "local_alias",
      },
      {
        canonicalName: "internalAction",
        exportName: "fromRegistrarFactory",
        registrationKind: "internalAction",
        resolution: "factory",
      },
    ]);
    expect(inventory.counts.aliases).toBe(2);
    expect(inventory.counts.factories).toBe(1);
    expect(inventory.counts.unresolved).toBe(0);
  });

  it("rejects duplicate export identities instead of counting aliases as registrations", async () => {
    const {
      collectConvexRegistrationInventory,
      validateConvexRegistrationInventory,
    } = await loadInventoryModule();
    const inventory = await collectConvexRegistrationInventory({
      projectPath: fixturePath("tsconfig.duplicate.json"),
    });
    const validation = await validateConvexRegistrationInventory(inventory);

    expect(inventory.rows).toHaveLength(1);
    expect(inventory.duplicates).toHaveLength(1);
    expect(inventory.counts.duplicate).toBe(1);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map(({ code }) => code)).toContain(
      "duplicate_export_identity",
    );
  });

  it("rejects type-matching registered exports whose registrar provenance is unresolved", async () => {
    const {
      collectConvexRegistrationInventory,
      validateConvexRegistrationInventory,
    } = await loadInventoryModule();
    const inventory = await collectConvexRegistrationInventory({
      projectPath: fixturePath("tsconfig.unresolved.json"),
    });
    const validation = await validateConvexRegistrationInventory(inventory);

    expect(inventory.rows).toEqual([]);
    expect(inventory.unresolved).toHaveLength(2);
    expect(inventory.counts.unresolved).toBe(2);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map(({ code }) => code)).toContain(
      "unresolved_registration",
    );
  });

  it("records a conditional ordinary-or-Generic registrar as unresolved", async () => {
    const {
      collectConvexRegistrationInventory,
      validateConvexRegistrationInventory,
    } = await loadInventoryModule();
    const inventory = await collectConvexRegistrationInventory({
      projectPath: fixturePath("tsconfig.conditional.json"),
    });
    const validation = await validateConvexRegistrationInventory(inventory);

    expect(inventory.rows).toEqual([]);
    expect(inventory.unresolved).toEqual([
      expect.objectContaining({ exportName: "conditionalRegistration" }),
    ]);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map(({ code }) => code)).toContain(
      "unresolved_registration",
    );
  });

  it("fails collection when source-project diagnostics make symbol resolution incomplete", async () => {
    const { collectConvexRegistrationInventory } = await loadInventoryModule();

    await expect(
      Promise.resolve().then(() =>
        collectConvexRegistrationInventory({
          projectPath: fixturePath("tsconfig.compiler-diagnostic.json"),
        }),
      ),
    ).rejects.toThrow(/diagnostic|cannot find module/iu);
  });

  it.each([203, 208])(
    "rejects the stale %i headline count when it disagrees with enumerated identities",
    async (staleDirectCount) => {
      const {
        collectConvexRegistrationInventory,
        validateConvexRegistrationInventory,
      } = await loadInventoryModule();
      const inventory = await collectConvexRegistrationInventory({
        projectPath: fixturePath("tsconfig.enumeration.json"),
      });
      const staleCandidate: Inventory = {
        ...inventory,
        counts: { ...inventory.counts, direct: staleDirectCount },
      };
      const validation =
        await validateConvexRegistrationInventory(staleCandidate);

      expect(validation.ok).toBe(false);
      expect(validation.diagnostics.map(({ code }) => code)).toContain(
        "declared_count_mismatch",
      );
    },
  );

  it("rejects a same-count identity replacement whose frozen digest is stale", async () => {
    const {
      collectConvexRegistrationInventory,
      validateConvexRegistrationInventory,
    } = await loadInventoryModule();
    const inventory = await collectConvexRegistrationInventory({
      projectPath: fixturePath("tsconfig.enumeration.json"),
    });
    const firstRow = inventory.rows[0];
    expect(firstRow).toBeDefined();
    if (firstRow === undefined)
      throw new Error("enumeration fixture produced no rows");
    const replacedCandidate: Inventory = {
      ...inventory,
      rows: [
        {
          ...firstRow,
          id: `${firstRow.id}:replacement`,
          exportName: "sameCountReplacement",
        },
        ...inventory.rows.slice(1),
      ],
    };
    const validation =
      await validateConvexRegistrationInventory(replacedCandidate);

    expect(replacedCandidate.rows).toHaveLength(inventory.rows.length);
    expect(validation.counts).toEqual(inventory.counts);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map(({ code }) => code)).toContain(
      "inventory_digest_mismatch",
    );
  });

  it("rejects silent loss when a syntax registration has no runtime-row join", async () => {
    const {
      collectConvexRegistrationInventory,
      validateConvexRegistrationInventory,
    } = await loadInventoryModule();
    const inventory = await collectConvexRegistrationInventory({
      projectPath: fixturePath("tsconfig.enumeration.json"),
    });
    const runtimeRows = inventory.rows.slice(1).map((row) => ({
      id: `runtime:${row.id}`,
      registrationIds: [row.id],
    }));
    const validation = await validateConvexRegistrationInventory(inventory, {
      runtimeRows,
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map(({ code }) => code)).toContain(
      "missing_runtime_row",
    );
    expect(
      validation.diagnostics.some(
        ({ rowId }) => rowId === inventory.rows[0]?.id,
      ),
    ).toBe(true);
  });

  it("rejects a classification contract whose declared source provenance is stale", async () => {
    const {
      collectConvexRegistrationInventory,
      validateConvexRegistrationInventory,
    } = await loadInventoryModule();
    const inventory = await collectConvexRegistrationInventory({
      projectPath: fixturePath("tsconfig.enumeration.json"),
    });
    const classifications = await classifiedFixture(inventory);
    classifications.sourceDigests[
      "tests/fixtures/phase-2-convex-registration-migration/enumeration.ts"
    ] = "0".repeat(64);
    const validation = await validateConvexRegistrationInventory(inventory, {
      classifications,
      requireClassified: true,
      runtimeSurfaceRefs: ["runtime:fixture"],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map(({ code }) => code)).toContain(
      "classification_source_digest_mismatch",
    );
  });

  it("rejects a classification runtime reference absent from the frozen namespace", async () => {
    const {
      collectConvexRegistrationInventory,
      validateConvexRegistrationInventory,
    } = await loadInventoryModule();
    const inventory = await collectConvexRegistrationInventory({
      projectPath: fixturePath("tsconfig.enumeration.json"),
    });
    const classifications = await classifiedFixture(
      inventory,
      "runtime:stale-line-qualified-ref",
    );
    const validation = await validateConvexRegistrationInventory(inventory, {
      classifications,
      requireClassified: true,
      runtimeSurfaceRefs: ["runtime:fixture"],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map(({ code }) => code)).toContain(
      "classification_runtime_ref_unknown",
    );
  });

  it("returns complete deterministic inventories larger than 64 KiB", async () => {
    const projectRoot = await mkdtemp(
      join(fixturePath("."), ".large-inventory-"),
    );
    temporaryProjects.push(projectRoot);
    const generatedServer = await readFile(
      fixturePath("_generated/server.ts"),
      "utf8",
    );
    await mkdir(join(projectRoot, "_generated"));
    await writeFile(
      join(projectRoot, "_generated", "server.ts"),
      generatedServer,
      "utf8",
    );
    await writeFile(
      join(projectRoot, "inventory.ts"),
      [
        "import { query } from './_generated/server'",
        ...Array.from(
          { length: 900 },
          (_, index) =>
            `export const deterministicLargeRegistration_${index.toString().padStart(4, "0")}_${"x".repeat(48)} = query({ args: {}, handler: async () => ${index} })`,
        ),
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(projectRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          lib: ["ES2022", "DOM"],
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
        },
        include: ["./inventory.ts", "./_generated/server.ts"],
      }),
      "utf8",
    );
    const { collectConvexRegistrationInventory } = await loadInventoryModule();
    const first = await collectConvexRegistrationInventory({
      projectPath: join(projectRoot, "tsconfig.json"),
    });
    const second = await collectConvexRegistrationInventory({
      projectPath: join(projectRoot, "tsconfig.json"),
    });
    const firstJson = JSON.stringify(first);

    expect(first.rows).toHaveLength(900);
    expect(Buffer.byteLength(firstJson, "utf8")).toBeGreaterThan(64 * 1024);
    expect(JSON.stringify(second)).toBe(firstJson);
  });

  it("makes registration identity claims without claiming control-flow dominance", async () => {
    const { collectConvexRegistrationInventory } = await loadInventoryModule();
    const inventory = await collectConvexRegistrationInventory({
      projectPath: fixturePath("tsconfig.enumeration.json"),
    });
    const forbiddenClaimKeys = new Set([
      "authorityVerdict",
      "controlFlow",
      "dominance",
      "proved",
      "sinks",
    ]);
    const observedKeys = new Set<string>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (value === null || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        observedKeys.add(key);
        visit(nested);
      }
    };
    visit(inventory);

    expect(inventory.analysisScope).toBe("registration_identity_only");
    expect(
      [...forbiddenClaimKeys].filter((key) => observedKeys.has(key)),
    ).toEqual([]);
  });
});
