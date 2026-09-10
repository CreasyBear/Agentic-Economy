/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // dependency-cruiser rules-reference on `viaOnly`: "For circular
    // dependencies - whether or not to match cycles that include
    // exclusively modules with this regular expression. This is different
    // from the regular via that already matches when only some of the
    // modules in the cycle satisfy the regular expression."
    // Using `pathNot` inverts the match (see
    // src/validate/matchers.mjs#matchesToViaOnly): it fires only when NONE
    // of the modules in the cycle satisfy the pathNot regex, i.e. every
    // intermediate module in the cycle is a non-barrel file.
    // NB: unlike `path`, dependency-cruiser's rule normalizer
    // (src/main/rule-set/normalize.mjs normalizeVia) only joins an array
    // into a single alternation regex for `.path`; a `.pathNot` array set
    // directly (not via the deprecated top-level `viaNot`) is passed through
    // unjoined and breaks matching, so this is one pre-joined regex string.
    //
    // The second alternative below (`^src/modules/capability-supply/`)
    // carves the capability-supply module's own non-barrel cycles out of
    // this strict rule (see `no-circular-capability-supply-internal`
    // below): with `pathNot`, the rule fires only when NONE of a cycle's
    // modules satisfy the combined regex, so a cycle where every module is
    // either a barrel file OR under capability-supply/ no longer fires
    // here - it is picked up as a warning instead. Checked against
    // node_modules/dependency-cruiser/types/restrictions.d.mts: "viaOnly -
    // For circular dependencies - whether or not to match cycles that
    // include exclusively modules with this regular expression."
    {
      name: "no-circular",
      severity: "error",
      comment:
        "This dependency is part of a circular relationship that does NOT " +
        "pass exclusively through a module barrel (public.ts/index.ts) and " +
        "is not confined to the capability-supply module (tracked " +
        "separately by no-circular-capability-supply-internal). Circular " +
        "imports make module boundaries unclear and can break Convex " +
        "codegen and bundling; break the cycle by extracting the shared piece " +
        "or inverting the dependency instead of importing back the other way.",
      from: {},
      to: {
        circular: true,
        viaOnly: {
          pathNot:
            "(^|/)public\\.ts$|(^|/)index\\.ts$|^src/modules/capability-supply/",
        },
      },
    },
    // dependency-cruiser rules-reference on `viaOnly` (same excerpt as
    // above): matches cycles where EVERY module in the cycle satisfies the
    // regular expression. Here `from.path` + `to.viaOnly.pathNot` together
    // select cycles that (a) start inside the capability-supply module and
    // (b) do not pass exclusively through a barrel file - i.e. the same
    // "real" (non-barrel) cycles `no-circular` used to flag, restricted to
    // this one module. Decision D3 excludes breaking these cycles (they
    // require capability-supply/internal module reshaping) for this
    // stabilisation pass, so they are downgraded to a tracked warning
    // instead of failing the build. Scoped to the whole
    // `capability-supply/` tree, not just `internal/`, because several of
    // the 48 baseline cycles loop through the module's own top-level
    // support files (e.g. tool-projection.ts, route-transport-runtime.ts)
    // that sit next to, not inside, `internal/`.
    {
      name: "no-circular-capability-supply-internal",
      severity: "warn",
      comment:
        "This dependency is part of a circular relationship confined to " +
        "the capability-supply module that does NOT pass exclusively " +
        "through a module barrel (public.ts/index.ts). Breaking it requires " +
        "capability-supply/internal module reshaping, which decision D3 " +
        "excludes from this stabilisation pass. Tracked as a warning so the " +
        "count stays visible for the Well 5 ratchet, but it does not fail " +
        "the build.",
      from: {
        path: "^src/modules/capability-supply/",
      },
      to: {
        circular: true,
        viaOnly: {
          pathNot: "(^|/)public\\.ts$|(^|/)index\\.ts$",
        },
      },
    },
    // dependency-cruiser rules-reference on `via`: "For circular
    // dependencies - whether or not to match cycles that include some
    // modules with this regular expression. ... Typically to temporarily
    // disallow some cycles with a lower severity - setting up a rule with a
    // via that ignores them in an 'allowed' section." Used here (severity
    // "warn") to keep the intra-module barrel-cycle count visible for the
    // Well 5 ratchet without failing the build.
    {
      name: "no-circular-via-barrel",
      severity: "warn",
      comment:
        "This dependency is part of a circular relationship that passes " +
        "through a module barrel (public.ts/index.ts) - the common " +
        "'internal/x.ts -> public.ts -> internal/x.ts' re-export pattern. " +
        "Tracked as a warning so the count stays visible for the Well 5 " +
        "ratchet, but it does not fail the build.",
      from: {},
      to: {
        circular: true,
        via: {
          path: "(^|/)public\\.ts$",
        },
      },
    },
  ],
  options: {
    // Only source is scanned; dependency-cruiser still needs to resolve into
    // node_modules to know an import isn't part of a cycle, so we exclude it
    // from the reported graph rather than refusing to follow into it.
    exclude: {
      path: [
        "node_modules",
        "convex/_generated",
        "dist",
        "\\.output",
        "output",
        "packages/cli/dist",
        // Generated by TanStack Router. It re-imports src/router.tsx (and
        // is imported back by it) by design as part of the router's
        // codegen contract - not a cycle we own or want to break.
        "src/routeTree\\.gen\\.ts",
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
