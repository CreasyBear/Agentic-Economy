# Cloudflare account baseline

This root owns only account-wide alerting. It does not own Tunnel, DNS, Access application, or runtime credentials.

Use a dedicated Cloudflare API token with `Notifications: Read` and `Notifications: Write` for the target account. Supply it only through `CLOUDFLARE_API_TOKEN`; never place it in a variables file or state input.

Initialize with the dedicated backend key, save a reviewed plan, and apply that exact plan. The two expected policies are `tunnel_health_event` and `expiring_service_token_alert`, both delivered to `joel@agentic-economy.ai`.
