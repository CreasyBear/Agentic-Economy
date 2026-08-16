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
      // Generated Playwright HTML report (gitignored) — not product source.
      'playwright-report/**',
    ],
  },
  supplyChain: {
    // PostHog is an intentional observability dependency; keep the Socket finding visible without blocking the L3 cleanup gate.
    severity: 'warning',
  },
}
