# Growth rules aecon breaks, 2026-10-09

Source: about 100 rules extracted from the saasyass notes, each audited against the code and app.aecon.ai by stage. Findings an opus skeptic refuted are dropped.

## The pattern
aecon has built a careful machine for agents but has given almost nothing to the humans who decide whether to use it. The landing page does not say who it is for, what one call costs or what you get back. The free quick win is gated behind an admin, and someone who stalls before their first receipt hears nothing from you. Nobody measures that first receipt either, so you cannot see where people drop out, which is a big part of why this feels so foggy. All of this can be fixed, and most of the plumbing (Resend, PostHog, the first-use stepper) already exists.

## Rules aecon breaks
Ranked by severity times reach.

| ID | Rule | How aecon breaks it | Evidence | What the user feels | Fix (familiar pattern) |
|---|---|---|---|---|---|
| R17, R90, R82 | Cheap entry shows a result in days | The free A$10 trial needs an admin, the first call takes about 5 CLI steps, and there is no one-command first call | Live /trial says "an Admin must approve your trial"; fund.ts:8-26 only prints a link; tools/list returns 33KB | "I came to see one receipt and got setup chores" | Auto-grant a capped sandbox credit, then `ae first-call` that searches, quotes, calls and prints the receipt (Stripe test mode, `stripe trigger`) |
| R31, R83, R87 | Onboarding emails triggered by what the user did or did not do | Only transactional alerts exist. Nothing fires on "not funded", "no agent" or "no call" | preferences.ts:28-35; crons.ts runs ops jobs only | "I stalled and never heard from you" | Three Resend emails, one per missing step, each stopping when the event happens (Stripe "finish setting up") |
| R66, R44, R76 | Track every stage and churn | 'activated' is declared but never emitted. There is no first-paid-call event and no cohort view | literals.ts:55; emitters send only visitor and published | You fly blind | Emit a first-receipt event and build a 5-stage PostHog funnel |
| R19, R20, R99 | Every post has a next step, and the funnel has five levels | There is no capture, lead magnet or hand-raise path. The only contact is support email | AeAboutPage.tsx:11 | "Looks cool", then the tab closes | One intent field plus a "first paid call in 5 minutes" config pack delivered by comment-to-DM (ManyChat) |
| R34, R33, R9 | Who, problem, result and next step within 90 seconds, pre-sold by video | The /market hero says "Intelligence, put to work." with no price, no result and no video | MarketLanding.tsx:32; /pricing and /docs return 404 | "I can't say what it sells or costs" | A 60-90 second phone recording of a paid call ending in its receipt, plus a /pricing page (Stripe, Linear) |
| R85, R32, R86 | Conversion before the trial ends, then win-back | The 30-day trial ends in silence | trial-access-contracts.ts:4; grep finds no win-back | "My trial just ran out" | Emails on days 23 and 28, a no-activity email at day 7, win-back at day 45, and a Slack alert to Joel on heavy accounts |
| R63, R2, R65 | Speed to lead | No hook fires on signup, funding or connect, and response time is not measured | owner_interest_submitted is declared and never emitted | "By the time I got the trial I'd moved on" | Instant capped trial for verified emails, plus a signup alert to Joel |
| R88, R13, R14 | Entry offer delivers and sits on a ladder | Nothing marks callable starter tools, the A$5 top-up is below the A$7-30 band, and there is no higher tier | add-credit.contracts.ts:3; moneyCommercialPolicy.ts:77 | "What does the cheap thing buy?" | Pin 3-5 callable starter tools, make A$10 the default amount, add a committed-spend tier later (AWS credits) |
| R35, R77 | Ask why people left | Disconnect and offboarding capture no reason | disconnect.ts:71 | "Nobody asked why" | A reason picker with 4 options in the disconnect dialog, reviewed weekly |
| R1, R68, R100 | A dedicated person gets each user to the first call | No owner and no human fallback | /support offers only a mailto link | "Stuck on IDs, nobody to ask" | Joel works a daily connected-but-never-called list, with "Stuck? 15 min with us" on the connect step |
| R45, R46, R75, R74 | Behaviour-triggered churn signals | No inactivity triggers, and the usage alerts are off by default | usageAlerts.ts:21 needs enabled===true | "My agent went quiet and nothing told me" | Turn alerts on by default, then add a 2x-gap no-call email with the buyer's own receipts |
| R84, R16, R15, R89 | Upsell right after value | The only money prompt appears on insufficient balance | ToolCard.tsx:208 | "You only ask when I'm blocked" | A "That cost A$0.02, top up A$10" card after the first receipt (Notion, Duolingo) |
| R18, R67, R21, R48 | Teach the problem, in buyers' words, by a founder on camera | No blog, no transcripts, no pixel, no video | /blog returns 404; no fbq in the code | Nobody finds you | Five short "my agent hit a 402" posts and a founder phone video |
| R29, R64, R27, R11, R12 | One outcome question, proof before the call, a landing target | Clerk sign-up asks no intent question, there are no case studies, no conversion target is set, and /market links to /developers/api rather than /for-agents | sign-up.$.tsx; AeTrialPage.tsx:81 | "Nothing shows my use case" | One onboarding question that preselects a tool, two dogfood case studies, and a link from /market to /for-agents |

## Rules aecon already follows
- **R30 and R79:** there is no forced tour. /market opens straight to search.
- **R47:** there is no "we saw you on the cancel page" email.
- **R78 and R81:** the owner stepper (HomeResumeToolSection.tsx:30-95) shows progress up to "delivered". The only gap is that funding is not one of its steps.
- **R80:** the chat flow opens an inline AddCreditSheet when credit runs short (Chat.tsx:167).
- **R73:** retention does not lean on a quarterly "we miss you" email.

## Not yet relevant
- **R22, R23-R26, R93, R94:** these cover webinars and live demos. Start a demo with the receipt already on screen.
- **R39-R43, R49, R58, R60, R61:** ad structure and creative refresh. Fix the landing path before buying any traffic.
- **R53-R56:** ad attribution. Use 7-day click only and check results against Convex data first.
- **R95:** boosting posts needs proven organic posts, and none exist yet.
- **R62:** payback period only applies once there is paid acquisition.
- **R4, R69:** pay for confirmations by first receipts once a concierge role exists.
- **R36-R38:** the saveable versus unsaveable split comes after the R35 reason picker.
- **R5-R8, R96-R98:** dead-lead emails need captured leads first.
- **R51:** never prompt a top-up before the first receipt.

## The five fixes that clear the most rules
1. **Emit activation and a funnel.** Clears R66, R44, R76, R65 and R62 groundwork, and sets up R53-R56. It goes in capture-client-events.ts and a Convex hook on the first receipted call. **Size S.**
2. **Self-serve first call.** Clears R17, R90, R82, R88, R63, R13, R14 and R84. It means an auto-granted capped sandbox credit, `ae first-call`, callable-only as the default market filter, starter tools, /pricing, and a top-up card shown after the first receipt. **Size L.**
3. **Lifecycle emails on the existing Resend path.** Clears R31, R83, R87, R85, R32, R86, R45, R46, R75, R74, R2, R35 and R77. It reuses notificationDelivery.ts, adds stalled-step, trial-end and inactivity emails, adds the disconnect reason picker, and turns alert defaults on. **Size M.**
4. **Rewrite the /market hero and record a founder video.** Clears R34, R33, R9, R48, R50, R57, R59, R27 and R12. The new hero reads "Your agent calls any paid API. You see every receipt.", sits next to a 60-90 second phone video, links to /for-agents, and has a single button. **Size M.**
5. **Hand-raise and concierge.** Clears R1, R68, R100, R20, R99, R19, R29 and R64. It adds one intent field ("what should your agent get done?"), the config-pack lead magnet, Joel's daily connected-but-never-called queue, and a "Stuck? 15 min" offer. **Size S.**

## What to measure
**Activation event:** an agent completes a paid call that returns a receipt. Emit it as `activated`.

Three numbers to watch weekly:
1. **Activation rate:** the share of signups that reach a first receipt within 7 days. Aim for 40% or more.
2. **Median time from signup to first receipt.** Aim for under 10 minutes.
3. **30-day retained buyers:** of each month's activated buyers, the share who make at least one paid call in the next 30 days. This is your churn line, and the rules treat about 6% monthly churn as normal.

One caution: two readiness checks today disagreed. /api/ready returned 200 in one and 503 `payments_unavailable` in another. Confirm it stays green before sending anyone to the product.
