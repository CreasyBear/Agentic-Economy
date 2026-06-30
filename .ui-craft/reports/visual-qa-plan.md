# AE Visual QA Plan

Date: 2026-06-29

Scope: visual verification plan for Agentic Economy public, owner, registry, and command readback surfaces. This report defines checks only. No source UI files were edited. No screenshots were captured because no local dev server was listening on `127.0.0.1:3000`, `5173`, `4173`, `4321`, or `8080`.

## QA Preconditions

- Use the existing Vite/TanStack app. Do not start a long-lived dev server from an inspiration lane unless explicitly asked.
- If another lane already has the local server running, use it.
- Default base URL: `http://127.0.0.1:3000`.
- Store manual or exploratory screenshots in `/tmp/ae-visual-qa/YYYY-MM-DD/`.
- Keep Playwright traces and failure screenshots in the project test output only when running existing tests.

## Core Pages To Capture

| Surface | URL | Why it matters |
| --- | --- | --- |
| Public landing | `/` | SmoothUI landing recipe adaptation; answer record as product visual; one claim conversion. |
| Registry | `/registry` | Search, pagination, rows/cards, no-results state, public trust labels. |
| Registry search result | `/registry?q=emergency+plumber+parramatta&limit=10` | Search density, proof rows, open-page CTA, no leaked authority fields. |
| Registry empty search | `/registry?q=fremantle+locksmith&limit=10` | Empty state clarity and recovery action. |
| Claim form | `/claim` | Forms, persistent labels, error focus, source-write authority. |
| Claim success | `/claim/success` | Published readback, public URL, unavailable actions, next owner status action. |
| Owner status | `/owner/status` | Status separation: public, index, discovery, trust, unavailable capabilities. |
| Public business page | `/parramatta-emergency-plumbing` | Public service facts, correction/removal path, no private/admin leakage. |
| Privacy correction/removal | `/privacy/remove-business` | Human dispute path, validation, owner safety. |
| Inquiry page | `/plumbing-demo/inquiry` | Human handoff surface; validates unavailable automation boundary. |
| Owner inquiry list | `/owner/inquiries` | Source-owned message state and delivery readback. |
| Owner inquiry detail | `/owner/inquiries/inquiry_thread%3Ahash%3Af3e29153` | Dense action surface: reply, mark read, close, delivery state. |
| Admin inquiry reconstruction | `/admin/inquiries?dispatchId=notification_dispatch%3Alocal-e2e%3A1` | Command surface, operator proof, refs, correlation data, dense metadata. |

## Viewport Matrix

Capture every core public surface at:

| Name | Size | Purpose |
| --- | --- | --- |
| Small phone | 320 x 568 | Worst-case copy wrapping and action reachability. |
| Standard phone | 375 x 812 | Existing Playwright compact baseline; primary mobile pass. |
| Large phone | 390 x 844 | Common iPhone width; persona gate for one-thumb use. |
| Phone landscape | 812 x 375 | Header, sticky affordances, and overflow stress. |
| Tablet portrait | 768 x 1024 | Two-column transition and touch/pointer hybrid behavior. |
| Tablet landscape | 1024 x 768 | Sidebar/nav density and mid-width section rhythm. |
| Laptop | 1280 x 800 | Common working viewport; above-fold composition. |
| Wide desktop | 1440 x 1100 | Existing Playwright wide baseline; section rhythm and max width. |
| Ultra-wide | 1920 x 1080 | Max-width discipline; no stretched ledger rows or orphaned hero. |
| Zoom stress | 1280 x 800 at 200% browser zoom | Pixel honesty, overflow, focus, text fit. |

Minimum required screenshots before public UI signoff:

- `/` at 320, 375, 390, 768, 1280, 1440, 1920.
- `/registry`, `/claim`, `/claim/success`, `/owner/status`, and `/parramatta-emergency-plumbing` at 375, 768, 1440.
- `/owner/inquiries/...` and `/admin/inquiries?...` at 375 and 1440.
- Error/empty states at 375 and 1440.

## Screenshot Naming

Use stable names:

```text
/tmp/ae-visual-qa/2026-06-29/landing-375x812.png
/tmp/ae-visual-qa/2026-06-29/landing-1440x1100.png
/tmp/ae-visual-qa/2026-06-29/registry-empty-375x812.png
/tmp/ae-visual-qa/2026-06-29/claim-error-focus-390x844.png
/tmp/ae-visual-qa/2026-06-29/admin-inquiries-1440x1100.png
```

## Browser Commands

When a local server is already running:

```bash
mkdir -p /tmp/ae-visual-qa/2026-06-29
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/e2e/public-owner-ui.spec.ts --project=compact-chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/e2e/public-owner-ui.spec.ts --project=wide-chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/e2e/a11y/public-owner-a11y.spec.ts --project=compact-chromium
```

For manual screenshot capture with Playwright codegen or the inspector:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright open http://127.0.0.1:3000/
```

For a one-off screenshot script, create the script outside source code or run inline from the terminal, with output in `/tmp` only:

```bash
node -e "const { chromium } = require('@playwright/test'); (async () => { const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 375, height: 812 } }); await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' }); await page.screenshot({ path: '/tmp/ae-visual-qa/2026-06-29/landing-375x812.png', fullPage: true }); await browser.close(); })();"
```

Do not run the full matrix from this report unless the local server is already running or the user asks you to start one.

## SmoothUI Landing Acceptance Gate For AE

Before signoff on `/`, run the landing recipe acceptance bar from `.agents/skills/ui-craft/references/recipe-landing.md`, adapted this way:

- Squint test: H1 -> primary claim action -> answer record.
- One conversion action: claim the answer record.
- Real visual: the source-owned answer record, not a generic product screenshot.
- Proof: claim/publish/correct/source-custody proof, not fake logos or vanity metrics.
- Feature rhythm: answer anatomy, source ledger, service rows, boundary panel; no 3-column icon-card grid.
- CTA hierarchy: nav claim, hero claim, lower-section claim links must not visually tie.
- Signature detail: known/unknown/unavailable/next-step grammar with source stamp.
- Mobile: claim and correction remain visible and reachable without horizontal overflow.
- Motion: no scroll-jacking; reduced-motion collapses entrances.

Failure examples:

- A screenshot-like dashboard that implies bookings, payments, automated actions, or live commerce rails.
- A hero that leads with "get found by agents" before source ownership.
- A proof strip with fake customer logos, fake numbers, or ungrounded trust claims.
- Feature blocks that can be reordered without changing meaning.

## Overflow Checks

Run in the browser console on every captured page and viewport:

```js
(() => {
  const doc = document.documentElement;
  const offenders = [...document.querySelectorAll('body *')]
    .filter((node) => node.scrollWidth > node.clientWidth + 1)
    .map((node) => ({
      tag: node.tagName,
      className: node.className,
      text: node.textContent?.trim().slice(0, 80),
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
  return {
    pageHasNoHorizontalOverflow: doc.scrollWidth <= doc.clientWidth,
    documentScrollWidth: doc.scrollWidth,
    documentClientWidth: doc.clientWidth,
    offenders,
  };
})();
```

Pass criteria:

- `pageHasNoHorizontalOverflow` is `true`.
- Long business names, slugs, IDs, service areas, and URLs wrap or truncate intentionally.
- Truncation exposes full value with a title, copy affordance, or detail row when the exact value matters.
- Buttons do not resize or jump when labels change to loading/success/error states.

## Contrast Checks

Manual and automated checks:

- Inspect text/background contrast for primary text, secondary text, disabled text, status text, links, focus rings, and command panels.
- Confirm status never relies on color alone. It must include text or icon plus text.
- Check Signal Cobalt on white and command surfaces, including hover/pressed states.
- Check success/warning/danger on tinted backgrounds at normal text size.
- Verify focus ring contrast against white, raised, muted, and command surfaces.

Suggested command if axe or an accessibility helper is added later:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/e2e/a11y --project=compact-chromium
```

Pass criteria:

- WCAG AA minimum for user-facing text.
- Focus is visible without relying only on color.
- Secondary text remains readable on `--ae-public-field`, `--ae-public-surface`, muted cards, and command panels.

## Focus And Keyboard Checks

Run on `/`, `/registry`, `/claim`, `/privacy/remove-business`, `/plumbing-demo/inquiry`, owner inquiry detail, and admin inquiry reconstruction.

Required checks:

- First Tab reveals skip link; Enter moves focus to `#main-content`.
- Focus order follows visual order.
- Primary action is reachable without pointer.
- Icon-only controls have accessible names.
- Dialogs/popovers, if present, trap focus appropriately and close with Escape.
- Claim form validation focuses the first invalid field and preserves entered values.
- Owner inquiry actions can be performed by keyboard: mark read, reply, close.

Browser snippet to inspect focus target:

```js
document.addEventListener('focusin', () => {
  console.log(document.activeElement?.tagName, document.activeElement?.textContent?.trim(), document.activeElement?.getAttribute('aria-label'));
});
```

Pass criteria:

- No keyboard trap.
- No focus loss after validation, submit, route navigation, or async state change.
- Focus indicators are visible on every interactive element.

## Motion Checks

Required checks:

- Trigger hover, focus, menu, form error, loading, success, and route states.
- Inspect CSS for `transition-all`, scroll listeners for animation, and animations longer than 400ms on UI state.
- Emulate `prefers-reduced-motion: reduce` and repeat the core flow.
- Confirm skeletons match final geometry for answer records, registry rows, claim form, and command readbacks.

Console check:

```js
matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Playwright setup snippet for reduced motion:

```ts
await page.emulateMedia({ reducedMotion: 'reduce' });
```

Pass criteria:

- Reduced motion path is fully usable.
- Nonessential entrances collapse or run at no more than 80ms.
- Motion never implies non-clickable cards are interactive.
- No scroll-jacking.

## Copy Overclaim Checks

Scan visible body text on every public/owner page for forbidden future-phase claims:

```js
(() => {
  const banned = /book now|booking confirmed|pay now|payment required|wallet|checkout|marketplace|request market|hosted agent|autonomous|agent handled|guaranteed response|MCP|OpenAPI|callable|agent-callable|payment-ready|verified/iu;
  const body = document.body.innerText;
  return {
    matched: banned.test(body),
    matches: [...body.matchAll(new RegExp(banned.source, 'giu'))].map((match) => match[0]),
  };
})();
```

Important: `verified` is only allowed when the visible record is actually `registry_verified`. Otherwise use "claimed", "source-owned", "published", "indexed", "pending", "unknown", or "unavailable" as appropriate.

Repository checks already related to this plan:

```bash
npm run test:copy
npm run test:ui-contract
```

Pass criteria:

- Public copy does not imply payments, bookings, wallets, request markets, MCP, OpenAPI, callable actions, autonomous actions, hosted agents, or guaranteed response.
- Every unavailable action has a next step or human handoff.
- Error and empty states name cause, consequence, and recovery.

## Data And Trust Checks

For public records, registry rows, owner status, inquiry, and admin readbacks:

- Known facts are not mixed with unknown values.
- Unknown values render as "Unknown" with explanation, not `N/A`, `null`, or fake zeros.
- Unavailable capabilities are textual and adjacent to next step.
- Source/custody labels stay near the facts they govern.
- Public pages do not leak `ownerId`, `serviceId`, `businessId`, `clerk`, `sourceHash`, raw contact, private evidence, admin refs, provider payloads, or implementation terms.
- Admin pages can show operator refs, but should still distinguish source, audit, funnel, operation, and correlation fields.

Browser snippet for public leakage:

```js
(() => {
  const leakage = /ownerId|serviceId|businessId|clerk|sourceHash|rawContact|private:evidence|provider payload|webhook secret|adminId/iu;
  const text = document.body.innerText;
  return { leaked: leakage.test(text), matches: [...text.matchAll(new RegExp(leakage.source, 'giu'))].map((m) => m[0]) };
})();
```

## Manual Review Pass

For each screenshot, record:

| Gate | Question | Pass/Fail |
| --- | --- | --- |
| Hierarchy | Does one thing dominate per viewport? |  |
| Answer record | Is the source-owned record visible and inspectable? |  |
| Boundary | Are known, unknown, unavailable, and next step all visible where relevant? |  |
| Action | Is the correct primary action obvious and reachable? |  |
| Trust | Does proof mean custody/correction rather than hype? |  |
| Rhythm | Do adjacent sections use distinct layouts and spacing? |  |
| Responsive | Is there zero horizontal overflow and no clipped text? |  |
| Accessibility | Are focus, contrast, labels, and status meaning visible? |  |
| Motion | Is movement restrained, purposeful, and reduced-motion safe? |  |
| Copy | Are future-phase claims absent? |  |

## Report Template For Future Runs

```markdown
# Visual QA Run

Date:
Base URL:
Commit:
Server already running: yes/no
Screenshots:

## Critical

## Major

## Minor

## Accepted Deferrals

## Commands Run

## SmoothUI Landing Gate

## Finish-Bar Summary
```

Ship threshold: zero Critical and zero Major findings, or written deferrals tied to `.ui-craft/brief.md` and accepted by the owner.
