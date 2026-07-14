export default {
  rules: {
    // v0.7.7 misclassifies ordinary event, effect, promise, and orchestration
    // callbacks as functional state updaters. All 14 current findings were
    // source-reviewed false positives; genuine ref/render impurity remains
    // covered by the other correctness rules.
    'react-doctor/no-impure-state-updater': 'off',
  },
  ignore: {
    files: [
      // Routing Kernel v1 is retired production authority. Keep the retirement
      // response and historical schema/readback scanned; exclude only dormant
      // implementation files that otherwise distort the active-code baseline.
      'src/modules/routing-kernel/authorization.ts',
      'src/modules/routing-kernel/http-capability-binding.ts',
      'src/modules/routing-kernel/http.ts',
      'src/modules/routing-kernel/internal/data-authorization-budget.ts',
      'src/modules/routing-kernel/internal/kernel.ts',
      'src/modules/routing-kernel/internal/store.ts',
      'src/modules/routing-kernel/mcp.ts',
      'src/modules/routing-kernel/structured-quote-preparation-store.ts',
      'src/modules/routing-kernel/structured-quote-preparation.ts',
    ],
  },
  supplyChain: {
    // PostHog is an intentional observability dependency; keep the Socket finding visible without blocking the L3 cleanup gate.
    severity: 'warning',
  },
}
