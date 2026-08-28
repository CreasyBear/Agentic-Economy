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
  },
  overrides: [
    {
      files: ['tests/**/*', 'tools/**/*'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
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
    {
      files: [
        'convex/moneyBrokeredDisputeEvidence.ts',
        'convex/lib/brokeredDisputeEvidence/**/*.ts',
        'src/lib/ui/contract-scans.ts',
        'src/lib/ui/contract-scans/**/*.ts',
        'src/modules/money/internal/payout-policy.ts',
        'src/modules/money/internal/payout-policy/**/*.ts',
        'src/modules/principal-account/account/registry.ts',
        'src/modules/principal-account/account/registry/**/*.ts',
      ],
      rules: {
        complexity: ['error', { max: 20, variant: 'classic' }],
      },
    },
    {
      files: [
        'convex/capabilitySupplyOperationProjection.ts',
        'convex/capabilitySupplyOperationProjection/**/*.ts',
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
