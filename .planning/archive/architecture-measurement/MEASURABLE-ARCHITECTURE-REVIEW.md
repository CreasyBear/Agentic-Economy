# Measurable Architecture Review

Date: 2026-07-02

## Inputs

- `react-doctor` baseline: `.planning/react-doctor/`
- refreshed codebase map: `.planning/codebase/`
- subagents:
  - `gsd-codebase-mapper` tech -> `STACK.md`, `INTEGRATIONS.md`
  - `gsd-codebase-mapper` arch -> `ARCHITECTURE.md`, `STRUCTURE.md`
  - `gsd-codebase-mapper` quality -> `CONVENTIONS.md`, `TESTING.md`
  - `gsd-codebase-mapper` concerns -> `CONCERNS.md`
  - `explorer` React Doctor architecture triage
  - `explorer` answer-thread/chat deep-module review

## Baseline

React Doctor command:

```bash
./node_modules/.bin/react-doctor --verbose --no-telemetry --output-dir .planning/react-doctor
```

Result: 663 diagnostics total. Score was intentionally disabled by `--no-telemetry`.

Source-only count after filtering generated/build/temp/report artifacts: 645 diagnostics.

| Category | Count |
|---|---:|
| Maintainability warnings | 332 |
| Performance warnings | 195 |
| Bug warnings | 56 |
| Bug errors | 4 |
| Accessibility errors | 41 |
| Accessibility warnings | 13 |
| Security warnings | 4 |

Top source rule clusters:

| Rule | Count |
|---|---:|
| `deslop/unused-export` | 166 |
| `react-doctor/async-await-in-loop` | 67 |
| `react-doctor/js-combine-iterations` | 63 |
| `react-doctor/only-export-components` | 56 |
| `react-doctor/no-multi-comp` | 47 |
| `react-doctor/aria-role` | 41 |
| `deslop/unused-file` | 31 |
| `react-doctor/server-sequential-independent-await` | 20 |
| `react-doctor/zod-v4-no-deprecated-schema-apis` | 18 |
| `react-doctor/js-min-max-loop` | 15 |

Refreshed codebase map line counts:

| Document | Lines |
|---|---:|
| `.planning/codebase/STACK.md` | 132 |
| `.planning/codebase/INTEGRATIONS.md` | 192 |
| `.planning/codebase/ARCHITECTURE.md` | 367 |
| `.planning/codebase/STRUCTURE.md` | 322 |
| `.planning/codebase/CONVENTIONS.md` | 198 |
| `.planning/codebase/TESTING.md` | 369 |
| `.planning/codebase/CONCERNS.md` | 532 |

Secret-pattern scan over `.planning/codebase` and `.planning/react-doctor`: no matches.

## Candidates

### 1. Deepen the answer-thread turn module

Recommendation: Strong.

Problem: `answer-thread/public.ts`, `answer/public.ts`, chat files, turn orchestration, projection, and tests expose too much implementation detail across the same seam. The module is shallow at the main interface: callers need to know turn records, frozen JSON, work logs, tool artifacts, replay state, and persistence fallback.

Baseline:

| Metric | Before | Target |
|---|---:|---:|
| `src/modules/answer-thread/public.ts` exported symbols | 80 | <= 30 |
| `src/modules/answer/public.ts` exported symbols | 96 | lower after answer-run/render adapter |
| `src/modules/answer-thread/internal/turn-orchestrator.ts` lines | 1373 | <= 600 |
| answer/chat React Doctor diagnostics | 105 | <= 50 |
| `src/components/ae/chat/AeChat.tsx` diagnostics | 13 | <= 3 |

Verification:

```bash
node -e 'const ts=require("typescript"),fs=require("fs"); for (const f of ["src/modules/answer-thread/public.ts","src/modules/answer/public.ts"]){const sf=ts.createSourceFile(f,fs.readFileSync(f,"utf8"),ts.ScriptTarget.Latest,true); let n=0; for (const st of sf.statements){ if(ts.isExportDeclaration(st)&&st.exportClause&&ts.isNamedExports(st.exportClause)){n+=st.exportClause.elements.length} else if((st.modifiers||[]).some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&st.name){n++} } console.log(n,f); }'
wc -l src/modules/answer-thread/internal/turn-orchestrator.ts src/components/ae/chat/AeChat.tsx src/components/ae/chat/AeThreadTurnStreamSection.tsx
./node_modules/.bin/react-doctor --verbose --no-telemetry --output-dir .planning/react-doctor
```

Deletion test: deleting the current wide public interface would not remove behavior; it would force the complexity into a deeper answer-turn module with better locality.

### 2. Collapse circular public seams

Recommendation: Strong.

Problem: public modules import internal implementation while internal modules import the public module interface. That inverts the seam and creates circular dependency diagnostics.

Baseline:

| Metric | Before | Target |
|---|---:|---:|
| `deslop/circular-dependency` findings | 7 | 0 |
| affected cycle files | 4 | 0 |

Evidence examples:

- `src/modules/catalog/public.ts`
- `src/modules/catalog/internal/publish.ts`
- `src/modules/observability/funnel.capture.server.ts`
- `src/modules/observability/internal/operator-controls.ts`

Verification:

```bash
./node_modules/.bin/react-doctor --verbose --no-telemetry --output-dir .planning/react-doctor
node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(".planning/react-doctor/diagnostics.json","utf8")); console.log(d.filter(x=>x.rule==="circular-dependency").length)'
```

Deletion test: deleting the current public re-export modules would not remove complexity; it would reveal implementation/interface coupling that should sit behind an acyclic seam.

### 3. Deepen route readback projection modules

Recommendation: Strong.

Problem: route files mix JSX, loader data, readback projection, utility exports, and repeated local submodules. That creates a broad interface and weak locality around route readbacks.

Baseline:

| Metric | Before | Target |
|---|---:|---:|
| `react-doctor/only-export-components` | 56 | route files no longer dominate |
| `react-doctor/no-multi-comp` | 47 | route files no longer dominate |
| `deslop/unused-export` | 166 | source-owned public module exports intentionally exposed |

Evidence examples:

- `src/routes/owner.business-actions.tsx`
- `src/routes/admin.business-actions.tsx`
- `src/routes/owner.inquiries.$threadId.tsx`

Verification:

```bash
./node_modules/.bin/react-doctor --verbose --no-telemetry --output-dir .planning/react-doctor
node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(".planning/react-doctor/diagnostics.json","utf8")); for (const r of ["only-export-components","no-multi-comp","unused-export"]) console.log(r,d.filter(x=>x.rule===r).length)'
```

Deletion test: deleting projection helpers from route files would not erase behavior; it would concentrate projection implementation behind route-readback modules.

### 4. Rework operator shell role interface

Recommendation: Worth exploring.

Problem: many routes pass domain role strings such as `owner` and `admin` through an interface named `role`, which collides with DOM/ARIA semantics in React Doctor. Some findings may be false positives, but the repeated caller knowledge still shows weak locality.

Baseline:

| Metric | Before | Target |
|---|---:|---:|
| `react-doctor/aria-role` findings | 41 | 0 shell-related findings |
| `react-doctor/prefer-tag-over-role` findings | 10 | 0 shell-related findings |

Evidence examples:

- `src/components/ae/layout/AeOperatorShell.tsx`
- `src/routes/admin.business-actions.tsx`
- `src/routes/owner.inquiries.tsx`
- `src/routes/owner.business-actions.tsx`

Verification:

```bash
./node_modules/.bin/react-doctor --verbose --no-telemetry --output-dir .planning/react-doctor
node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(".planning/react-doctor/diagnostics.json","utf8")); for (const r of ["aria-role","prefer-tag-over-role"]) console.log(r,d.filter(x=>x.rule===r).length)'
```

Deletion test: deleting repeated route-level role declarations would concentrate owner/admin presentation behavior in one shell module, which is real leverage if the shell interface can keep domain role separate from DOM role.

## Top Recommendation

Tackle candidate 1 first: deepen the answer-thread turn module.

It has the best combination of active worktree relevance, high diagnostic count, high interface width, and clear test leverage. It also protects the user-visible answer experience without changing AE's trust contract: assistants may read, compare, summarize, route to next step, and submit qualified inquiries only when published.

