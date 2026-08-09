#!/usr/bin/env tsx
// Pre-deploy evaluation gate for the Agentic-Economy engine.
//
// Two layers, run in this order:
//   L0 STRUCTURAL (always, deterministic, CI-safe): validates the golden corpus
//     contract itself — count, duplicate-id freedom, per-workflow balance, and
//     the sovereign honesty rules (hostile/greenfield never fabricate, keyed-env
//     without a credential is not a plan, observed-x402 is never executable,
//     fx-degenerate is never a hollow single-pair plan). This catches a malformed
//     or regressed corpus before any model is invoked, with no live environment.
//   L1 LIVE (opt-in via --live): runs the live engine harness when the local
//     dev server + seeded Convex are available, and fails on any MUST regression.
//
// Usage:
//   node .../gate.ts            # structural only (CI / pre-commit safe)
//   node .../gate.ts --live     # structural + live engine harness
// Exit 0 = gate passes; nonzero = a deploy-blocking regression.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

import {
    GOLDEN_CASES,
    GOLDEN_WORKFLOW_IDS,
    RUNNABLE_EVAL_CASES,
    VISION_DIMENSIONS,
    VISION_PENDING_CASES,
} from './cases/index'

const LIVE = process.argv.includes('--live')
const FAILURES: string[] = []

function fail(msg: string): void {
    FAILURES.push(msg)
}

// ---------------------------------------------------------------------------
// L0 — structural corpus contract (deterministic, no live environment).
// ---------------------------------------------------------------------------
function structuralGate(): void {
    const l1 = RUNNABLE_EVAL_CASES
    const l2 = VISION_PENDING_CASES

    // Count / layer contract: >=100 L1 runnable cases (the objective's floor).
    if (l1.length < 100) {
        fail(`golden L1 corpus has ${l1.length} cases (< 100 required)`)
    }

    // Every exported case must be L1 (endpoint) and every L2 case must be pending.
    if (GOLDEN_CASES.some((c) => c.layer !== 'endpoint')) {
        fail('GOLDEN_CASES contains a non-endpoint layer case (corpus layering drift)')
    }
    if (l2.length > 0 && l2.some((c) => c.status !== 'pending')) {
        fail('VISION_PENDING_CASES must all be status=pending until the Project engine ships')
    }

    // Duplicate-id freedom across both layers.
    const ids = new Set<string>()
    for (const c of [...GOLDEN_CASES, ...l2]) {
        if (ids.has(c.id)) {
            fail(`duplicate golden case id: ${c.id}`)
        }
        ids.add(c.id)
    }

    // Per-workflow coverage against the engine evaluation table.
    const perWorkflow = new Map<string, number>()
    for (const c of l1) {
        perWorkflow.set(c.workflow, (perWorkflow.get(c.workflow) ?? 0) + 1)
    }
    for (const wf of GOLDEN_WORKFLOW_IDS) {
        const n = perWorkflow.get(wf) ?? 0
        if (n < 3) {
            fail(`workflow '${wf}' has only ${n} L1 case(s) (min 3 for a meaningful gate)`)
        }
    }

    // Well-formedness + sovereign honesty invariants (never negotiable).
    for (const c of l1) {
        if (!GOLDEN_WORKFLOW_IDS.includes(c.workflow)) {
            fail(`case ${c.id} references unknown workflow '${c.workflow}'`)
        }
        const expected = Array.isArray(c.expectedKind) ? c.expectedKind : [c.expectedKind]
        if (expected.length === 0) {
            fail(`case ${c.id} has an empty expectedKind`)
        }

        const hostileLike = c.workflow === 'hostile' || c.workflow === 'greenfield'
        const wantsPreview = expected.includes('preview')
        if (hostileLike && wantsPreview) {
            fail(`case ${c.id} (${c.workflow}) must never expect a preview (no-fabrication)`)
        }

        // The universal honesty invariant is already structural: mustNotFabricate
        // is true on every case (a grounded preview is compatible with it — it
        // means the preview must never invent a wrong capability). Only the
        // refusal rows (expectedKind is NOT preview) forbid an executable plan.
        if (!wantsPreview && !c.mustNotFabricate) {
            fail(`case ${c.id} is a refusal row but is not marked mustNotFabricate`)
        }

        // keyed-env without a credential is never an executable plan.
        if (c.workflow === 'keyed-env' && wantsPreview) {
            fail(`case ${c.id} (keyed-env) must never expect a preview without a credential`)
        }
        // observed-x402 is discoverable but never executable.
        if (c.workflow === 'observed-x402' && wantsPreview) {
            fail(`case ${c.id} (observed-x402) must never expect an executable preview`)
        }
        // fx-degenerate ('USD to USD') is never a hollow single-pair plan.
        if (c.workflow === 'fx-degenerate' && wantsPreview) {
            fail(`case ${c.id} (fx-degenerate) must never expect a preview plan`)
        }
    }
}

// ---------------------------------------------------------------------------
// L1 — live engine harness (opt-in: needs dev server :3000 + seeded Convex).
// ---------------------------------------------------------------------------
function liveGate(): void {
    const root = fileURLToPath(new URL('../../', import.meta.url))
    const harness = `${root}eval/engine/run-evaluation.mjs`
    if (!existsSync(harness)) {
        fail(`live engine harness missing: ${harness}`)
        return
    }
    try {
        execFileSync(process.execPath, [harness, '--runs=1'], {
            cwd: root,
            stdio: 'inherit',
        })
    } catch {
        // execFileSync throws when the harness exits nonzero (a MUST regression).
        // The harness already printed the failing rows; nothing more to add here.
        fail('live engine harness reported MUST failures (see above)')
    }
}

// ---------------------------------------------------------------------------
// Run + exit.
// ---------------------------------------------------------------------------
structuralGate()
console.log(
    `structural gate: ${RUNNABLE_EVAL_CASES.length} L1 runnable cases, ` +
        `${VISION_PENDING_CASES.length} L2 vision-pending (not run today), ` +
        `${VISION_DIMENSIONS.length} vision dimensions spec-pinned`,
)
if (LIVE) {
    console.log('live gate: running live engine harness ...')
    liveGate()
} else {
    console.log('live gate: skipped (pass --live to run the live engine harness against a seeded env)')
}

if (FAILURES.length > 0) {
    console.error('\nPRE-DEPLOY EVAL GATE FAILED:')
    for (const f of FAILURES) {
        console.error(`  - ${f}`)
    }
    process.exit(1)
}
console.log('PRE-DEPLOY EVAL GATE PASSED')
