# Attribution spec: UTM everything

Status: draft, 2026-10-10.

Goal: every sign-up, first receipt and top-up can be traced to the campaign, link or email that brought the person. This holds across aecon.ai, app.aecon.ai and agents.

## Today
- **App:** reads only `utm_source`, `utm_campaign` and `ref` (`src/lib/observability/funnel-client.ts:62-70`) and persists nothing.
- **PostHog:**
  - It uses `sessionStorage` (`posthog.client.ts:85-93`), so identity dies with the tab.
  - It only identifies the anonymous `sess_` id and never identifies the account on sign-in.
  - Anonymous events get no person profile.
- **Sign-up:** the Clerk round trip drops UTMs (`useSignUpPage.ts:14-17`). The account stores no source (`provisioning.ts:289-337`), and journey events carry none.
- **Marketing site:** strips the query from every pageview (`agentic-economy-website/src/lib/analytics-config.ts:9-17`), so GA4 and Meta never see UTMs. Its CTAs go to `/launch`. Redirects into the app pass the query through (`marketplace-redirects.ts:6-17`).
- **Outbound links we generate carry no UTMs:** emails, MCP and install config, SKILL.md, llms.txt and share links.

## Rules (reference: GA4 campaign URL conventions; PostHog UTM and person-property docs)
1. **Capture everything, everywhere:**
   - `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
   - click IDs: `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `li_fat_id`, `ttclid`
   - `ref` and the referrer domain

   Do not hand-roll this. posthog-js already records these as `$initial_*` (first touch) and per-event (last touch) properties once rule 2 is in place.
2. **One identity across domains.** PostHog `persistence: 'localStorage+cookie'` and `cross_subdomain_cookie: true` on `.aecon.ai`, on both the marketing site and the app. Gate it on consent where the site's consent applies.
3. **Identify on sign-in.** Call `posthog.identify(accountRef digest)` at sign-in and sign-up, so the anonymous journey and its first touch attach to the account. Use the same digest the server journey events use (`convex/journeyEvents.ts:20`). Call `reset()` on sign-out.
4. **Store attribution on the account.** At provisioning, write a `firstTouch` and a `lastTouch` object (the fields from rule 1 plus a landing path and a timestamp) as optional fields. Pass them through the Clerk sign-up as `unsafeMetadata`, or through a post-sign-up mutation from the client. Server journey events then carry `firstTouch.source/medium/campaign` as properties, so activation can be cut by campaign without client data.
5. **Marketing site:**
   - Stop stripping UTMs and click IDs from the page location sent to GA4 and the Pixel. Keep stripping everything else.
   - Its CTAs link into the app with the visitor's current UTMs forwarded. If there are none, tag the link `utm_source=aecon.ai&utm_medium=website&utm_campaign=<page>`.
6. **Tag every link we generate,** through one helper (`withUtm(url, {source, medium, campaign, content})`). Do not hand-concatenate.

   | Surface | source | medium | campaign | content |
   |---|---|---|---|---|
   | Approval email | aecon | email | approval | cta |
   | Stalled-step emails | aecon | email | stalled_add_credit, stalled_connect_agent, stalled_first_call | cta |
   | Operator digest | aecon | email | operator_digest | the link |
   | Catalogue broadcast (later) | aecon | email | broadcast_YYYYMM | the link |
   | Share links `/s/` | aecon | share | chat_share | none |
   | Copy public URL button | aecon | share | public_url | none |
   | SKILL.md, llms.txt, MCP install docs | aecon (deviation: a static file cannot know the agent client) | agent | install | skill_md or llms_txt; page links only, never /mcp or API paths |
   | Social posts, ads | the platform | social, cpc | the campaign name | the creative id |

7. **Naming:** lowercase, words joined by underscores, never spaces. Campaigns are named `<objective>_<audience>_<yyyymm>`. Keep a register in this file.
8. **Separate new from existing customers,** per the ads notes, which warn that Meta counts view-through by default. The activation events carry `isNewAccount`, and ad reporting is checked against our own first receipts.

## Measure
- Share of sign-ups with a non-empty `firstTouch.source`. Target: 95% or more.
- First receipts by first-touch source and campaign.
- Time from first touch to first receipt.

## Build order (small PRs)
1. **App PostHog config:** persistence cookie, cross-subdomain, identify and reset. Its own test. Reference: PostHog docs.
2. **Account attribution:** optional `firstTouch` and `lastTouch` fields, captured at sign-up, and journey events carrying the source.
3. **The `withUtm` helper,** applied to emails, share links, SKILL.md, llms.txt and install docs.
4. **Marketing site:** keep UTMs in analytics, forward them on CTAs into the app, and use the same PostHog cookie domain.

## Open questions for Joel
- Is PostHog on the marketing site acceptable, or does it stay on GA4, Meta and Clarity only? The default is both, consent-gated.
- Should the app ask for consent before setting the analytics cookie? The default is a consent banner for Meta and GA, with PostHog first-party cookies allowed as necessary analytics, per the Australian Privacy Principles and your privacy policy. This needs your call.
