# Define connected as two-stage readiness

Type: grilling
Status: resolved
Blocked by:

## Question

What observable state should the feature call a successful agent connection without forcing purchasing authority into public discovery?

## Answer

Use two familiar, explicit readiness states:

1. **Ready to browse** — the selected harness or API client can reach AE, negotiate the supported transport, and successfully perform a public discovery check.
2. **Ready to buy** — the same durable Agent Principal has completed owner-approved authorization and AE can read its current authority state without exposing the credential.

Transport success must not imply funding or authority. Authorization must not be required merely to browse.

