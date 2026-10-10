# Email, brand and marketing plan, 2026-10-10

Source: a haiku swarm read every brand source (Codex brand folder, marketing site repo, platform design system), inventoried the marketing site and mapped emailcn blocks. Two haiku opinions reviewed it and sonnet wrote the plan. See also attribution-spec.md.

## Decision
Transactional email lives in the platform (app.aecon.ai) on Resend and React Email, sent from a subdomain. Marketing email waits until a newsletter will actually be written, then uses Resend Broadcasts and nothing more. The marketing site stays small and static. Catalogue and task pages stay in the platform, and indexing is switched on for them once they are ready.

## Who owns what
| Domain or page type | Owner |
|---|---|
| aecon.ai: home, product, pricing, about, guides, news, glossary, waitlist, contact, legal | Marketing site repo (TanStack Start, Vercel) |
| app.aecon.ai: sign-in, workspace, catalogue pages, task pages | Platform repo |
| Transactional email (templates, triggers, send logic) | Platform |
| Waitlist confirmation email | Site, until the platform can take it |
| Broadcasts (later) | Resend Broadcasts, with the list exported from the waitlist |
| mail.aecon.ai (sending domain: SPF, DKIM, DMARC) | Resend |

Nothing new is built in the site repo for email.

## Email system
- **Components:** React Email, with one shared layout (logo, body, footer) and four templates. Install `block-notification-default` and `billing-order-summary` from emailcn. Hand-write the approval and nudge emails on React Email primitives, because emailcn has no approval, nudge, digest or alert blocks. emailcn has no Forest theme, so override its tokens.
- **Brand brief applied:**
  - Colours: Chalk #E8E4DA ground, Charcoal #141414 text, Forest #24543D for the one button. Gold appears only inside the symbol.
  - Type: Manrope at 400 and 500 only. The Arial, Helvetica, sans-serif fallback is our assumption, not in any source.
  - Logo: forest symbol PNG, no `ae` marks.
  - Voice: Australian English, sentence case, no em dashes, no hype words.
  - Copy: Tool, Provider, Task, Credit, Receipt. Never "AUD Credit".
  - Prices print as A$0.003.
- **The four emails.** I don't have today's actual four, so I'm assuming approval request, receipt, low credit, and stalled-step nudge. Subjects:
  1. Approval request: "Your agent needs your approval for a A$4.20 task"
  2. Receipt: "Receipt for your Task, A$0.003"
  3. Low credit: "Your Credit is running low"
  4. Nudge (one only): "Your agent is connected. Run its first Task when you're ready"
- **Sending domain:** mail.aecon.ai, with a reply-to a person can answer. Marketing and transactional mail share it until volume says otherwise.
- **Sign-off:** "A world taking shape" is the approved tagline. We use it in the footer only, never in subject lines.

## Website and SEO
- **Moves:** the waitlist confirmation email moves to the platform once it has an inbound path.
- **Stays:** the marketing pages, guides, news, glossary and market report stay in the site repo. The catalogue and task pages stay in the platform.
- **Blocker:** neither surface is indexable today. `robots.txt` is `Disallow: /` and root meta is `noindex, nofollow` unless `VITE_INDEXABLE` is set. Catalogue pages have no SEO value until that changes.
- **Indexing plan:** index the site first (flip the flag, publish the sitemap, which has 84 URLs). Then open the catalogue pages in the platform with canonicals and a sitemap, after a spot check of page quality.
- **Domain split:** app.aecon.ai is a separate host from aecon.ai. Link the two surfaces to each other from every page, so both are discoverable.
- **Redirects:** keep the existing 308 path redirects from site to platform.

## Measure
1. Waitlist signups per week, confirmed (not raw).
2. Share of signups who connect an agent within 7 days.
3. Share who add Credit within 14 days.
4. Transactional delivery and bounce rate on mail.aecon.ai.
5. Indexed pages in Google Search Console, split by site and platform.

## Build order
1. **Email foundation (platform).** Verify mail.aecon.ai. Add React Email, the shared layout and the receipt template. Replace the bare `fetch` to Resend with the SDK, and move the plain-text bodies into templates.
2. **Remaining three templates.** Approval request, low credit, and the single nudge, with the nudge behind a flag. Send each one to a test inbox in Gmail and Apple Mail, light and dark.
3. **Indexing.** Flip `VITE_INDEXABLE`, rewrite `robots.txt` and the sitemap, and add the platform catalogue sitemap. Fix the `brand-copy.ts` "AUD Credit" and em dash drift in the same PR.

## Questions for Joel
1. **Email CTA colour:** Forest (platform primary) or chalk/charcoal (site primary)? Default: Forest for platform email.
2. **Is the site's positioning the x402 buyer account or the research publication?** Default: the buyer account. Root BRAND and VOICE get archived, not deleted.
3. **Is the thesis line "Software has just become an economic actor" ever used as a tagline?** Default: no. It stays an editorial line, and "A world taking shape" is the tagline.
4. **Will you write a newsletter, and how often?** Default: no newsletter, so no Broadcasts until you say so.
5. **When do the sites go indexable?** Default: site first, platform catalogue two weeks later.
6. **Retire the platform `ae-*` logo files?** Default: yes, remove them in PR 3.

## Reconciliation

**aecon brand brief (email-ready)**

- **Name:** Agentic Economy (full), aecon (compact), aecon.ai.
- **Palette:** Charcoal #141414 (text, dark surfaces). Chalk #E8E4DA (light surface). Forest #24543D (email CTA, selected accent). Gold #E5AA35 (symbol endpoint only).
- **Type:** Manrope, fallback Arial, Helvetica, sans-serif. Regular 400 body, Medium 500 emphasis. Avoid ExtraLight 200 in email.
- **Logo:** Light clients use `aecon-symbol-forest` PNG (400px). Dark clients use the chalk/gold symbol on a charcoal square (`icon-192.png`). No `ae` marks. Horizontal lockup is mobile nav only.
- **Voice:** Australian English. "We" for our work, "you" for the decision. Sentence case, no em dashes, no hype. Avoid unlock, leverage, seamless, "not X, but Y". No invented customers or numbers. Product copy says Tool, Provider, Task, Credit, Receipt, never capability, endpoint, listing or "AUD Credit".
- **Tagline:** "A world taking shape" (social/brand kit). No sign-off is defined in any source.

**Conflicts**

| Item | Sources | Winner and why |
|---|---|---|
| Primary button | Forest (platform) vs Chalk/Charcoal (site DESIGN) | Forest for platform (dated 10 Oct, Joel confirmed). Site keeps chalk/charcoal until reopened. |
| Forest role | Artwork accent (site) vs button/link/focus (platform) | Per owner surface. |
| Display weight | 200 (site) vs 400/500 only (platform) | Each surface keeps its own. |
| Logo | Standalone symbol, 7 Sep (site) vs `ae` lockups in platform `public/brand/logo/` | Site. `ae` retired 7 Sep. Platform files need removal. |
| Domain | aecon.ai vs agentic-economy.ai (root VOICE) | aecon.ai. |
| Positioning | Research publication (root BRAND) vs x402 buyer account (planning BRAND) | Planning for product. Root unreconciled. |
| Paired `ae` mark | brand-stress-test.md | Superseded by 7 Sep symbol-only. |
| "AUD Credit" | Allowed in editorial, banned in platform | Platform for product UI. |
| Tagline | "A world taking shape" vs "Software has just become an economic actor." | Unresolved. Joel to pick. |

**Ownership today**
- Site (aecon.ai): Exhibition homepage, guides, news, market report, waitlist, contact. Chalk theme, chalk/charcoal primary.
- Platform (app.aecon.ai): product UI, Forest primary, Arc/shadcn, 13/20 workspace type. `brand-copy.ts` still says "AUD Credit".

**Paths (read-only)**
- `/Users/joelchan/Documents/Codex/2026-10-02/task/aecon-jev-investigation/planning/DESIGN.md`, `BRAND.md`, `VOICE.md`
- `/Users/joelchan/Documents/Coding/App-Dev/live/agentic-economy-website/planning/DESIGN.md`
- `/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/DESIGN.md`

## Correction (2026-10-10, live check)
The skeptic's claim that neither surface is indexable is wrong for production.
- `https://aecon.ai/robots.txt` and the www host serve `Allow: /` with two sitemaps (`/sitemap.xml` and `/agent-native-index/sitemap.xml`). The home page has no noindex meta.
- `https://app.aecon.ai/robots.txt` serves `Allow: /` and blocks only `/admin/`, `/owner/`, `/private/` and `/disputes/`.
- The repo's `agentic-economy-website/public/robots.txt` (`Disallow: /`) is not what production serves.

So both sites are indexable now. The SEO gap is the app's tool pages: they are missing from the sitemap and have no canonical, OG or Product/Offer JSON-LD. Question 5 (when to go indexable) is withdrawn.
