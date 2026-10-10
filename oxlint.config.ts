import nkzw from '@nkzw/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [nkzw],
  env: {
    browser: true,
    builtin: true,
    es2024: true,
    node: true,
  },
  categories: {
    correctness: 'error',
    suspicious: 'off',
  },
  rules: {
    // Keep the config focused on correctness. Repository-wide style migrations
    // should be isolated changes, not permanent release-gate noise.
    '@nkzw/no-instanceof': 'off',
    '@typescript-eslint/array-type': 'off',
    'import-x/no-namespace': 'off',
    'no-console': [
      'error',
      { allow: ['error', 'info', 'warn'] },
    ],
    'no-debugger': 'error',
    'no-control-regex': 'off',
    'no-underscore-dangle': 'off',
    'no-unused-vars': 'error',
    'no-useless-escape': 'off',
    'perfectionist/sort-enums': 'off',
    'perfectionist/sort-heritage-clauses': 'off',
    'perfectionist/sort-interfaces': 'off',
    'perfectionist/sort-jsx-props': 'off',
    'perfectionist/sort-object-types': 'off',
    'perfectionist/sort-objects': 'off',
    'prefer-arrow-callback': 'off',
    'prefer-const': 'off',
    // These compiler diagnostics are useful during component refactors, but
    // are not correctness gates for the current non-compiled React runtime.
    'react/incompatible-library': 'off',
    'react/set-state-in-effect': 'off',
    'typescript/triple-slash-reference': 'off',
    'unicorn/catch-error-name': 'off',
    'unicorn/consistent-function-scoping': 'off',
    'unicorn/no-magic-array-flat-depth': 'off',
    'unicorn/no-typeof-undefined': 'off',
    'unicorn/no-useless-fallback-in-spread': 'off',
    'unicorn/no-useless-spread': 'off',
    'unicorn/numeric-separators-style': 'off',
    'unicorn/prefer-array-index-of': 'off',
    'unicorn/prefer-at': 'off',
    'unicorn/prefer-import-meta-properties': 'off',
    'unicorn/prefer-single-call': 'off',
    'unicorn/prefer-string-raw': 'off',
    'unicorn/prefer-string-replace-all': 'off',
    'unicorn/prefer-string-starts-ends-with': 'off',
    'unicorn/prefer-structured-clone': 'off',
    'unicorn/prefer-top-level-await': 'off',
    'unicorn/text-encoding-identifier-case': 'off',
    // Re-enable this after a dedicated, conflict-free mechanical migration.
    curly: 'off',
    // Design system R9/R11: money and time are formatted only by
    // formatCurrencyAmount (exact-amount.ts) and format-time.ts. Warning while
    // the existing bypasses migrate; raise to error once the count is 0.
    'no-restricted-properties': [
      'warn',
      { object: 'Intl', property: 'NumberFormat', message: 'Format money with formatCurrencyAmount and counts with format-time.ts.' },
      { object: 'Intl', property: 'DateTimeFormat', message: 'Format dates and times with src/lib/ui/format-time.ts.' },
      { property: 'toLocaleString', message: 'Use formatCurrencyAmount or src/lib/ui/format-time.ts.' },
      { property: 'toLocaleDateString', message: 'Use src/lib/ui/format-time.ts.' },
      { property: 'toLocaleTimeString', message: 'Use src/lib/ui/format-time.ts.' },
    ],
  },
  overrides: [
    {
      // The formatters themselves, plus vendored Arc, Arc Pro and shadcn
      // primitives, which stay unedited (design-system spec, vendored Arc files).
      files: [
        'src/lib/ui/format-time.ts',
        'src/modules/money/internal/exact-amount.ts',
        'src/components/arc/**/*',
        'src/components/ae/shared/arc-pro/**/*',
        'src/components/ui/**/*',
      ],
      rules: { 'no-restricted-properties': 'off' },
    },
    {
      files: ['src/components/arc/**/*'],
      rules: {
        // Preserve upstream vendor bytes for equivalent Number/global spellings.
        'unicorn/prefer-number-properties': 'off',
      },
    },
    {
      files: ['tests/**/*', 'tools/**/*'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
        'no-restricted-properties': 'off',
      },
    },
    {
      files: [
        'convex/capabilityOperationInvocations.ts',
        'convex/capabilityProviderConnections.ts',
        'convex/lib/operationInvocations/**/*.ts',
        'convex/lib/providerConnections/**/*.ts',
        'convex/lib/qualifiedUsePayout/**/*.ts',
        'src/modules/capability-execution/invocation-worker/recover.ts',
        'src/modules/capability-execution/invocation-worker/recovery/**/*.ts',
        'src/modules/capability-supply/internal/openapi-import/**/*.ts',
        'src/modules/capability-supply/internal/publication-importer-openapi.ts',
        'src/modules/money/internal/ledger.ts',
        'src/modules/money/internal/ledger/**/*.ts',
      ],
      rules: {
        complexity: ['error', { max: 10, variant: 'classic' }],
      },
    },
    // Verbatim handler moves from former `capabilityProviderConnectionAttempts.ts` monolith.
    // Per-file complexity ceilings are ratchets — lower as handlers are simplified; never raise.
    {
      files: ['convex/lib/providerConnections/cancelAttemptOwner.ts'],
      rules: {
        complexity: ['error', { max: 12, variant: 'classic' }],
      },
    },
    {
      files: ['convex/lib/providerConnections/bindAttemptOAuthOwner.ts'],
      rules: {
        complexity: ['error', { max: 19, variant: 'classic' }],
      },
    },
    {
      files: ['convex/lib/providerConnections/finalizeAttemptOwner.ts'],
      rules: {
        complexity: ['error', { max: 34, variant: 'classic' }],
      },
    },
    {
      files: ['convex/lib/providerConnections/reserveAttempt.ts'],
      rules: {
        complexity: ['error', { max: 59, variant: 'classic' }],
      },
    },
    {
      files: [
        'convex/moneyBrokeredDisputeEvidence.ts',
        'convex/lib/brokeredDisputeEvidence/**/*.ts',
        'src/lib/ui/contract-scans.ts',
        'src/lib/ui/contract-scans/**/*.ts',
        'src/modules/principal-account/account/registry.ts',
        'src/modules/principal-account/account/registry/**/*.ts',
      ],
      rules: {
        complexity: ['error', { max: 20, variant: 'classic' }],
      },
    },
    {
      files: [
        'convex/capabilitySupplyOwnerFunnelProjection.ts',
        'convex/capabilitySupplyOwnerFunnelProjection/**/*.ts',
        'convex/lib/marketExternalRegistry/**/*.ts',
        'convex/lib/workloadCron/**/*.ts',
        'convex/marketExternalRegistry.ts',
        'convex/moneyCreditTopup.ts',
        'convex/moneyCreditTopup/**/*.ts',
        'convex/moneyPayoutTransferShared.ts',
        'convex/moneyPayoutTransferShared/**/*.ts',
        'convex/workloadCron.ts',
        'src/lib/server/agent-access-oauth-api.ts',
        'src/lib/server/agent-access-oauth/**/*.ts',
        'src/modules/authority/delegation/delegation.ts',
        'src/modules/authority/delegation/contracts.ts',
        'src/modules/authority/delegation/persistence.ts',
        'src/modules/registry/internal/registry-action-contracts.ts',
        'src/modules/registry/registry.actions.ts',
      ],
      rules: {
        complexity: ['error', { max: 30, variant: 'classic' }],
      },
    },
    {
      files: [
        'convex/moneyBillingAuthorization.ts',
        'convex/moneyBrokeredInvalidOutputLoss.ts',
      ],
      rules: {
        complexity: ['error', { max: 20, variant: 'classic' }],
      },
    },
    {
      files: ['convex/moneyChargeBrokered.ts'],
      rules: {
        complexity: ['error', { max: 30, variant: 'classic' }],
      },
    },
    {
      files: ['src/modules/capability-supply/internal/publication/**/*.ts'],
      rules: {
        complexity: ['error', { max: 30, variant: 'classic' }],
      },
    },
  ],
  ignorePatterns: [
    'convex/_generated/**',
    'src/routeTree.gen.ts',
    'tests/fixtures/**',
    'vendor/**',
  ],
});
