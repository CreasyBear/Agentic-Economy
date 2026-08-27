# Routes (operator settings + shell)

Framework: TanStack Router (file routes under `src/routes`). Operator layout: `/_operator`.

## Settings (first Superdesign target)

| Path | File | Layout |
| --- | --- | --- |
| `/owner/settings` | `src/routes/_operator/owner.settings.tsx` | `OwnerSettingsShell` → `AeOperatorShell` + `OwnerSettingsNav` current=`profile`. Content: `AccountSettingsSection` |
| `/owner/settings/workspace` | `src/routes/_operator/owner.settings.workspace.tsx` | same, current=`workspace`. Content: `AeWorkspaceGeneral` |
| `/owner/settings/members` | `src/routes/_operator/owner.settings.members.tsx` | current=`members`. Content: `AeWorkspaceMembers` |
| `/owner/settings/connections` | `src/routes/_operator/owner.settings.connections.tsx` | current=`connections`. Content: `AeOwnerProviderConnections` |
| `/owner/credit` | credit route (also in settings nav) | current=`credit`. Content: `AeOwnerCredit` |
| `/owner/settings/payouts` | `src/routes/_operator/owner.settings.payouts.tsx` | current=`payouts`. Content: `AeSupplyEarningsCard` |
| `/owner/settings/developers` | `src/routes/_operator/owner.settings.developers.tsx` | current=`developers`. Content: `AeWorkspaceDevelopers` |

Nav IA: `src/lib/operator/settings-navigation.ts` (User / Workspace / Developers).

## Operator sidebar destinations

From `src/lib/operator/navigation.ts` owner groups:

- Records: `/owner/offerings` Operations, `/activity` Calls, `/agent-access` Keys, `/owner/credit` Credit, `/owner/status` Supplier
- Work: `/owner/supply` Publish
- Account: `/owner/settings` Settings
- Resources: `/market` Catalog, `/` Home, `/for-agents` Agent setup, `/privacy/remove-business` Help & corrections

Role home: `/owner/offerings`.
