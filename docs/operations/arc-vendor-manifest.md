# Arc vendor manifest

Regenerated **2026-10-07** against the live free registry (`https://uiarc.dev/r/<id>.json`). The comparison hashes each registry `files[].content` against the local file. `src/components/arc/**` holds Free items only, and `tsconfig.arc.json` typechecks all of them at upstream strictness.

- **PRISTINE**: byte-identical to the registry. Shared helpers in `arc/lib/` were checked the same way.
- **PATCHED**: upstream plus a minimal `// arc-patch:` accessibility or semantic change, recorded in [arc-vendor-patches.md](arc-vendor-patches.md).

Resync any row with `npx shadcn@latest add @uiarc/<id>`. Then re-apply its patch from the ledger, and re-run this comparison.

## Free items in `src/components/arc/`

| Entry | Status | Registry dependencies |
|---|---|---|
| `arc-foundation` | PRISTINE | — |
| `copy-button` | PRISTINE | arc-foundation |
| `segmented-control` | PRISTINE | arc-foundation |
| `input` | PRISTINE | arc-foundation |
| `alert` | PATCHED | arc-foundation |
| `accordion` | PATCHED | arc-foundation |
| `skeleton` | PRISTINE | arc-foundation |
| `filter-toolbar` | PATCHED | arc-foundation |
| `usage-meter` | PRISTINE | arc-foundation |
| `stepper` | PRISTINE | arc-foundation |
| `empty-state` | PATCHED | arc-foundation |
| `chip-group` | PATCHED | arc-foundation |
| `combobox` | PATCHED | arc-foundation |
| `sparkline` | PRISTINE | arc-foundation |
| `textarea` | PRISTINE | arc-foundation |
| `button` | PRISTINE | arc-foundation |
| `sortable-data-table` | PRISTINE | arc-foundation |
| `avatar` | PRISTINE | arc-foundation |
| `line-chart` | PRISTINE | arc-foundation |
| `radio-cards` | PRISTINE | arc-foundation |
| `search-field` | PRISTINE | arc-foundation |
| `expandable-card` | PRISTINE | arc-foundation |
| `badge` | PRISTINE | arc-foundation |
| `donut-chart` | PATCHED | arc-foundation |
| `blocks/site-footer` | PRISTINE | arc-foundation, button, segmented-control |
| `blocks/faq-section` | PATCHED | arc-foundation, search-field, segmented-control |
| `blocks/hero-section` | PRISTINE | arc-foundation, avatar, button, copy-button, line-chart, segmented-control, sparkline |

## AE-owned, not vendored

These do not auto-update from Arc. Port upstream visual or motion changes into them by hand. Reasons are in [the elevation plan §1a](arc-elevation-plan-2026-10-06.md#1a-amendments-after-e1e2-measurement-2026-10-07).

- **Pro-derived compounds**, in `src/components/ae/shared/arc-pro/`: `agent-run`, `ai-chat`, `ai-composer`, `api-keys`, `billing-overview`, `chat`, `funnel-chart`, `integrations`, `market`, `marketplace-dashboard`, `metrics-dashboard`, `multi-step-form`, `orbit-logos`, `security-settings`, `settings-page`, `sidebar-rail`, `team-members`, `usage-billing`. Pristine Pro blocks render built-in demo data and export none of the slots AE uses.
- **Base UI ports**, in `src/components/ae/shared/base-ui/`: `checkbox`, `drawer`, `select`, `tabs`. Upstream builds these on Radix, and Joel kept Base UI.
- **Edge adapters**, in `src/components/ae/shared/`: `action-link` (`actionLinkClassName`), `arc/alert`, `arc/empty-state`, `status-badge`, `status-stepper`, `copy-value`, `usage-meter`, `record-page-header`, `comparison-table`, `sortable-data-table`, `router-link-boundary`, `router-tabs`.

## Removed in E5

`animated-counter`, `avatar-group`, `blocks/comparison-table`, `empty-states` and `progress` had no importers. Reinstall one from the registry when a screen needs it.
