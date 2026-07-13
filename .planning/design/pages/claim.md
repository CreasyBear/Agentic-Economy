# /claim — Claim your business page

## Register & scene

**Register:** product. **Scene:** a business representative completes a consequential publishing form on a laptop at a counter during the workday, occasionally returning after an interruption; the light warm-canvas scene requires a stable single-column form, explicit save/readback cues, and restrained eucalyptus only on the publish action.

The color strategy is restrained: warm canvas surrounds white form surfaces, ink and slate carry labels and help text, and eucalyptus marks focus/current selection and the primary publish action. Status colors are functional only.

## Job & IA position

**One job:** let an authenticated or otherwise admitted business representative review and publish one truthful public business page. **Route class:** owner activation (IA-1), rendered inside public chrome without treating shell-rendered as anonymous authorization. **Entry points:** business-page claim link, Help, public shell/footer, and allowed prefill links. Query prefill may set only `businessName`, `slug`, `category`, and `suburb`; it never authors publication outcomes, contact readiness, or confirmation. **Exits:** successful publication to `/claim/success?slug=…`, preview of the draft page, deliberate leave with recovery, and safe return to Help.

**Blueprint:** IA-6 focused form, header plus a `max-w-5xl` single column because the long consequential form needs room for section readback while staying one reading rail; IA-7 `px-4 md:px-6`, section rhythm 12, block rhythm 6, interior rhythm 4. D5 requires session recovery plus a navigation blocker because publication is consequential. DS-12 owns validation and submission.

## Layout

`AePublicShell` contains `AePageHeader`, then a single `<form>` rail at `max-w-5xl`. The form is linear: recovery status → optional import → business identity → public service details → contact/readiness choice → publication review → fact confirmation → named publish action. Do not use a right sticky summary that separates consequence facts from the mobile action, and do not split the form into a wizard unless the domain creates durable step boundaries.

### Desktop wireframe, 1440px viewport

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AePublicShell: public navigation                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ max-w-6xl AePageHeader                                                       │
│ FOR BUSINESSES                                                               │
│ Claim your business page                                                     │
│ Publish details people can find in the registry.                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                     max-w-5xl, 24px gutter                                   │
│ [Draft recovered / Saved in this browser session]                            │
│                                                                              │
│ Import a starting draft (optional)                                           │
│ Website URL __________________________  ABN __________ [Prepare draft]        │
│                                                                              │
│ Business identity                                                            │
│ Business name _______________________  Category ______________________        │
│ Suburb ______________________________  State/territory ______________        │
│ Public page address __________________________________________________       │
│                                                                              │
│ Service details                                                              │
│ Service name ________________________  Service area __________________        │
│ Public summary ______________________________________________________        │
│ Hours or “not listed” _______________  Supporting image/file _______         │
│                                                                              │
│ How people can reach this business                                           │
│ ( ) First contact offered   ( ) Quote request offered   ( ) Not offered      │
│ Public note / unavailable reason ____________________________________        │
│                                                                              │
│ Review what will be published                                                │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Business · service · location · page URL · contact posture · source     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ [ ] I confirm these public details are supplied by the business…             │
│                                                                              │
│ Publishing makes this page visible and findable in the registry.             │
│ It does not turn on agent actions or prove current availability.             │
│ [Publish business page]  [Preview public page]                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile wireframe, ≤375px

```text
┌───────────────────────────────┐
│ AePublicShell header      [≡] │
├───────────────────────────────┤
│ FOR BUSINESSES                │
│ Claim your business page      │
│ Publish truthful public facts │
├───────────────────────────────┤
│ [Draft saved in this session] │
│                               │
│ Import a draft (optional)     │
│ Website URL                   │
│ [___________________________] │
│ ABN                           │
│ [___________________________] │
│ [Prepare draft]               │
│                               │
│ Business identity             │
│ Label                         │
│ [field______________________] │
│ …                             │
│                               │
│ Review what will be published │
│ Business …                    │
│ Service …                     │
│ Public page …                 │
│ Contact posture …             │
│                               │
│ [ ] I confirm these details   │
│                               │
│ Visible + findable only.      │
│ No agent-action claim.        │
│ [Publish business page]       │
│ [Preview public page]         │
└───────────────────────────────┘
```

At mobile width the consequence recap, confirmation checkbox, boundary copy, and publish button are adjacent with no disclosure or unrelated navigation between them.

## Section anatomy

1. **Page header:** states the page benefit without claiming routeability. Content: “Claim your business page” and a short description of public discoverability. Data source: route static model. Components: `AePageHeader`.
2. **Draft recovery/status:** after hydration, restores `ae.claimFormDraft.v1` from `sessionStorage`, preserving user-edited dirty fields over later imported/prefilled values. Content: `Draft restored from this browser session` or a quiet `Draft saved in this browser session`; never imply server persistence. Data source: client session draft projection. Components: Astryx `Banner` for restored/corrupt recovery; `Text`/status for ordinary autosave.
3. **Optional import:** website URL and optional ABN prepare a draft only. Imported fields never overwrite dirty fields. Copy says “Review the imported draft. Nothing publishes until you confirm and publish.” Data source: route action/server function. Components: `FormLayout`, `Field`, Astryx input, `Button`, `Banner`, existing `AeClaimFormSection`.
4. **Business identity:** business name, category, suburb, state/territory, requested public slug, and source attribution where required. Data source: route state plus allowed URL prefill/import draft. Components: `AeClaimFormSection`, `FormLayout`, `Field`; field-local errors.
5. **Service details:** one clear service, category, summary, service area, hours-or-unknown, public image URL/supporting files, and response-time statement only when sourced. Data source: form state. Components: `Field`, `AeFileUploadField`, `AeRangeField` only where the existing data type genuinely requires a bounded range. Supporting-file preview must not imply publication if only the URL publishes.
6. **Contact/readiness posture:** exactly one current R1-compatible choice: first contact offered, quote request offered where the business publishes that capability, or not available yet with reason. There is no fan-out, provider comparison, procurement, booking, payment, wallet, ordering, or future-rung control. Data source: form state. Components: `AeRadioCardGroup`, `Field`, conditional text area.
7. **Publication review:** direct readback of every public field, source, public page address, and current contact posture. This is the second deliberate disclosure level under LAW-7, not a third duplicate summary. Data source: item/form projection. Components: existing `AeReviewBlock`, semantic `<dl>`, `Badge` only for text-first publication posture.
8. **Confirmation and publish:** checkbox confirms that these public details are supplied by the business and ready to publish. Boundary copy immediately above the CTA states what publication proves and does not prove. Data source: form state and validation. Components: `AeCheckboxField`, `AeActionButton`/Astryx `Button`.
9. **Preview:** secondary link becomes enabled only when a valid slug exists. Preview is visibly labelled `Preview`, carries current draft truth, and does not claim live availability or routeability (DS-15). Data source: form projection. Components: Astryx `Button` secondary or router link.

## States

- **Loading / hydration:** render the full settled form geometry as `Skeleton` blocks inside the `max-w-5xl` rail, including section headings, field rows, review block, and action row. Keep labels or accessible loading title. Do not show only “Preparing form.” When server prefill/import data loads independently, preserve all dirty user fields.
- **Initial:** empty or allowed prefilled fields; publish disabled until required fields validate and the facts checkbox is selected. Prefill is visibly editable and has no authority.
- **Draft recovered:** merge restored data once after hydration, dirty fields winning. Announce politely once: “Draft restored from this browser session.” A corrupt/incompatible draft is removed and the blank form remains usable; show a nontechnical Banner only if user work was plausibly lost.
- **Autosaving:** short edits synchronously update session recovery. No spinner or live announcement per keystroke. A quiet label may move from `Saving in this browser` to `Saved in this browser session`; it must not say “Saved to your account.” Storage failure shows one warning with the consequence: “This browser could not save your draft. Leaving may lose your changes.”
- **Import pending:** import button disabled and `aria-busy`; existing form remains readable and editable unless merge consistency requires a narrowly scoped lock. On success, merge only untouched fields and reset the final facts confirmation because the readback changed. On failure, preserve every current field and show a section Banner with a specific retry/edit path.
- **Validation error:** DS-12 field-local message with `aria-invalid` and `aria-describedby`; a summary Banner says how many fields need attention and links/focuses to them. Focus the first invalid field after submit. Do not clear valid fields.
- **Server submission error:** keep the complete form and review context, show `Publish did not complete` Banner, and provide one cause-specific retry. Raw server errors never render.
- **Pending publish:** exact named button remains in place, disabled, with `aria-busy="true"` and loading label `Publishing business page`. Prevent duplicate submits. Navigation blocker remains active until authoritative success or failure readback.
- **Success:** clear the session draft only after authoritative successful publication response, then navigate to `/claim/success` with the canonical slug.
- **Empty:** a form has no ordinary empty state. If owner admission or claim target is unavailable, choose DS-13 meaning precisely: `access denied` for missing authority, `resource not found` for a target that cannot be located, or `temporarily unavailable` for service failure. Preserve public chrome and provide `Return to business page`, `Sign in`, or `Try again` as appropriate without revealing protected existence.
- **Streaming:** none. Import and publish are bounded pending operations, not streamed content.
- **Zero JS / SEO:** route is `noindex`. Server-render labels, section guidance, and a clear JavaScript-required Banner if the transactional action cannot function without JS. Never show an enabled publish control without a working handler. The public shell and Help/Privacy links remain usable.

## Interactions

### Primary action and confirmation depth

Primary action: **Publish business page**. Publication is consequential but reversible through later correction/removal and is not an external customer send. Use **inline confirmation** under AX-2: full publication readback + explicit fact checkbox + named CTA. Do not add a modal merely to repeat the same facts.

Full state contract:

1. **Idle:** enabled only when the form is valid and the facts confirmation is selected.
2. **Hover/focus/active:** Astryx states; visible focus ring; no scale flourish.
3. **Disabled:** visible reason next to the control, such as “Review the fields above and confirm the public details.” Disabled state is not conveyed by opacity alone.
4. **Loading:** label becomes `Publishing business page`, control stays in place, duplicates lock, action row has `aria-busy`.
5. **Error:** restore actionable control after authoritative failure, retain all data, focus error Banner only when no field error owns focus.
6. **Success:** clear only this claim draft and route to the readback page. A toast may acknowledge, but it is not the publication record.

### Dirty-form policy, D5

- Session recovery is automatic for the form draft. Store the value, `factsConfirmed`, and dirty-field identities under the existing versioned key. Do not persist uploaded file bytes or secrets in `sessionStorage`.
- Mount TanStack Router `useBlocker` for any navigation away while the form differs from the last authoritative initial/restored snapshot or a publish is unresolved. Browser close/reload uses `beforeunload` only while dirty/pending.
- Blocker copy names the loss: **Leave this claim? Your text draft is saved only for this browser session. Selected files and any unsaved publishing result may be lost.**
- Actions: **Stay and review** (primary, returns focus to the initiating link/control) and **Leave this claim** (destructive secondary). Use Astryx `Dialog` only here because abandoning selected files or an unresolved publish can be consequential. Ordinary draft edits do not trigger a modal.
- During unknown publish outcome, do not offer an immediate duplicate publish. Reconcile/read back first; the blocker explains that publication status must be checked.

### Validation and focus

On failed submit, set all field errors, render/update the error summary, then call the shared focus-first-invalid helper against the first invalid control. Radio groups focus their group control; hidden conditional fields are never selected as first error unless visible. After correction, errors clear predictably on blur or resubmit according to the shared form contract. Imported changes that invalidate a reviewed value reset `factsConfirmed` and focus the changed-section notice, not an arbitrary field.

### Keyboard

Tab order matches the visual single column. Enter does not submit from import fields; `Prepare draft` is a scoped button. Space operates radio/checkbox controls. Escape closes only the leave dialog and returns focus. Preview opens through a normal link and preserves draft state. Every target is at least 44px.

## Copy voice

- Headline: **Claim your business page.**
- Description: **Publish accurate business and service details people can find in the registry.**
- Draft labels: `Draft restored from this browser session`, `Saved in this browser session`.
- Import action: `Prepare a draft`; boundary: `Nothing publishes until you review and publish it.`
- Review heading: `Review what will be published`.
- Confirmation: **I confirm these public details are supplied by the business and ready to publish.**
- Primary CTA: **Publish business page**.
- Boundary copy beside CTA: **Publishing makes this page visible and findable in the registry. It does not turn on agent actions. The business confirms price, timing, availability, and whether it can help.** The implementation specification still records the internal `discoverable inventory, not routeable supply` boundary from `PRODUCT.md` rule 7; that mechanics vocabulary does not appear in customer copy.
- Avoid `Get found by every agent`, `AI-ready`, `routeable`, `onboarded supply`, `live requests`, `leads`, `bookings`, `payments`, `wallet`, `credits`, `procurement`, `provider`, `capability binding`, and guaranteed reach.

## Responsive

- `md` permits two fields on a row only when they are logically paired (suburb/state, business/category); all long text and review facts remain full width.
- Below `md`, every field and action stacks. There is no sticky side rail.
- At ≤375px, consequence recap → fact checkbox → boundary copy → primary action remain contiguous. Primary and preview buttons are full-width; publish appears first because it is the named decision, preview follows as a noncommitting alternate.
- File controls wrap filenames, status, and remove actions without horizontal overflow. Radio cards stack and retain 44px targets.
- At 200% zoom the page remains one readable column with no clipped error text or action overlap.

## Accessibility

- Landmarks: `AePublicShell` supplies banner/navigation/footer; one `<main id="main-content">`; `<form aria-labelledby>` references the page title. Each section uses `fieldset`/`legend` where fields form a choice group, otherwise an `h2`.
- Persistent labels for every field. Required state is communicated in text and programmatically. Errors use `aria-invalid` + `aria-describedby`; summary links point to controls.
- `aria-live="polite"` is reserved for one restored-draft message and one settled import result. Submission failure uses one `role="alert"`. Keystrokes, storage writes, and validation while typing are silent.
- Pending import/publish uses `aria-busy` on the scoped region and a stable text label. Do not announce both button change and duplicate global status.
- The leave dialog has an accessible title/description, traps focus through Astryx behavior, returns focus, and names what may be lost.
- Reduced motion reaches all final states immediately; no entrance choreography. Status, error, and selected radio meaning are text/shape based, never color only.

## Rule compliance

| Rule | How `/claim` satisfies it |
|---|---|
| LAW-2 | Publication creates/returns a canonical page identity before redirect; slug remains stable. |
| LAW-3 | Pending, failed, and published states each define known facts, next transition, action/recovery, and identity. |
| LAW-4 | Publication proves visible/findable only, never availability, routeability, or business confirmation. |
| LAW-5 | Full public-field readback and consequence sit immediately before `Publish business page`. |
| LAW-7 | Editable form is primary; one publication review is the deeper level. No third summary. |
| IA-1 | Classified owner activation even though it uses public chrome. |
| IA-2 | Entry/exit links derive from shared route registry. |
| IA-6, IA-7 | Focused single-column form, deliberately `max-w-5xl`, `px-4 md:px-6`, named rhythm. |
| IA-8 | Route owns loading/search/SEO/action wiring; form sections remain reusable compositions. |
| AX-2 | Consequential reversible publication uses exhaustive inline confirmation, not modal-first design. |
| AX-3 | CTA names the object and consequence; no bare Submit/Continue. |
| AX-5 | Duplicate lock and authoritative success readback; toast is not evidence. |
| AX-7 | Publication and business-confirmation boundaries sit beside the CTA. |
| DS-1, DS-2 | Astryx fields/buttons/dialog; Tailwind only arranges layout. |
| DS-3, DS-10, DS-11 | Semantic aeTheme tokens, no local palette, no unsupported dark mode. |
| DS-4 | Wrappers preserve labels, disabled/loading, keyboard, and focus-visible behavior. |
| DS-5, DS-6 | Astryx motion tiers only; reduced motion is immediate. |
| DS-7 | Publication/contact posture uses text-first centralized status semantics. |
| DS-12 | `FormLayout`, local errors, summary Banner, focus-first-invalid, disabled/loading submit. |
| DS-13, DS-14 | Access/not-found/unavailable are distinct; skeleton preserves settled geometry and errors preserve form. |
| DS-15 | 44px targets; preview labelled and never implies live capability. |
| D5 | Session recovery plus route and browser navigation blocker names what can be lost. |
| WEDGE R1 | One business page and at most one first-contact posture; no R2–R4 UI or claims. |

## Anti-slop check

No side stripe, gradient text, glassmorphism, hero metrics, identical card grid, or modal-first interaction. The form is not a generic SaaS onboarding wizard and does not celebrate publication with fake reach metrics. Category-reflex check: this is a familiar, restrained publishing form, not a neon “AI onboarding” funnel. Cards are used only for a bounded review or Astryx form composition, never around every section.

# /claim/success — Business page published

## Register & scene

**Register:** product. **Scene:** the same business representative sees the authoritative publication result immediately after a consequential form submission, in a busy daytime setting and needing proof plus one next step; the light scene emphasizes the exact page identity and publication facts rather than celebration effects.

## Job & IA position

**One job:** read back exactly what was published and provide the canonical public-page path. **Route class:** owner activation (IA-1), not public discovery; it emits `noindex`. **Entry point:** authoritative successful `/claim` response only, with canonical slug search dependency. **Exits:** view public page, copy public URL, manage/correct the page if supported, or return to Help. **Blueprint:** IA-6 focused record, header plus `max-w-5xl` single column; LAW-3 state contract; LAW-4 progressive certainty; LAW-7 summary plus exact published facts; AX-5 readback.

## Layout

`AePublicShell` → `AePageHeader` → `max-w-5xl` record rail. The first visible block is a text-first publication status and canonical URL. The next block is an exact `<dl>` of published facts. A final boundary/next-action row gives one primary action. Avoid a confetti hero, giant check icon, metric panel, or accent-drenched success card.

### Desktop wireframe, 1440px viewport

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AePublicShell                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ PUBLISHED                                                                    │
│ Your business page is published.                                             │
│ It is visible at /{slug} and findable in the registry.                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ max-w-5xl                                                                    │
│ Public page    https://…/{slug}       [Copy link] [View public page]          │
│                                                                              │
│ What was published                                                           │
│ Business …        Category …        Location …        Public page …          │
│ Contact posture … Source …           Published at …                          │
│ Publication does not turn on agent actions or prove availability.            │
│ [View public page]                                      [Manage/correct page] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile wireframe, ≤375px

```text
┌───────────────────────────────┐
│ PUBLISHED                     │
│ Your business page is         │
│ published.                    │
│ Visible + findable in registry│
│                               │
│ Public page                   │
│ /{slug}                       │
│ [Copy public link]            │
│ [View public page]            │
│                               │
│ What was published            │
│ Business …                    │
│ Category …                    │
│ Location …                    │
│ Contact posture …             │
│ Published at …                │
│                               │
│ Honest boundary sentence      │
│ [Manage or correct page]      │
└───────────────────────────────┘
```

## Section anatomy

1. **Publication status:** `Published` eyebrow, headline, canonical slug, and exact truthful reach. Data source: route loader readback from the published catalog record, never optimistic client state. Components: `AePageHeader`, centralized `AeStatusBadge`/Astryx `Badge` if needed, `Text`.
2. **Canonical page action:** visible URL, copy action, and view action. Data source: loader record + canonical base URL. Components: `AeCopyPublicUrlButton`, Astryx `Button`, `Link`.
3. **Published facts:** business, category, location, public slug, service/contact posture, source attribution, and published timestamp if available. Data source: route loader/item projection. Components: semantic `<dl>`, shared `AeTimestamp`/`<time>`.
4. **Boundary and next step:** explains that a published page is discoverable inventory; it is not routeable supply unless an admitted, conformant capability exists, and it does not prove current availability. Customer-facing short form: “Your page is published. Any price, timing, availability, and whether you can help still come from the business.” Components: `Text`, one primary `View public page` action, secondary `Manage or correct page`.

## States

- **Loading:** preserve header, URL-row, details grid, and actions as geometry-matched `Skeleton`; shell remains usable. Do not announce “published” before loader readback.
- **Available:** authoritative published record renders. Status label is `Published`; copy says visible and findable in registry only.
- **Missing slug:** DS-13 `resource not found`; title `Publication record not found`, copy `This link does not identify a published business page`, action `Return to claim` or Help.
- **Slug not found:** DS-13 `resource not found`; do not expose protected claim metadata. Offer `Check the page address` and Help.
- **Readback unavailable:** DS-13 `temporarily unavailable`; title `Publication status unavailable`, copy “We could not read the page status right now. This does not prove publication failed.” Primary recovery `Check status again`; no new publish action.
- **Access denied:** if management data requires authority, separate that from the public page readback. Public page facts may remain visible while management action routes to sign-in; do not mislabel as not found unless privacy policy requires indistinguishability.
- **Error:** preserve shell and slug if safe; no raw errors. Unknown status never becomes unpublished or failed.
- **Streaming:** none.
- **Zero JS / SEO:** full readback and public link render server-side. Copy-to-clipboard degrades to a selectable URL. `robots: noindex`; canonical public business page, not the success URL, is the share target.

## Interactions

Primary action: **View public page**, AX-2 link-out review depth. It opens the exact canonical public page and does not alter state. Secondary: `Copy public link`; clipboard success may use a brief toast or control-label change, with no lifecycle claim. `Manage or correct page` names its destination and may encounter authentication there without interrupting the publication readback.

State contract: Astryx default/hover/focus/active; URL copy announces `Public link copied` politely once; failure leaves the selectable URL and states `Copy did not work. Select the link to copy it.` No loading state claims success before loader readback. Focus on route entry lands on the `h1`; after copy it remains on the copy control.

## Copy voice

- Eyebrow: **Published**.
- Headline: **Your business page is published.**
- Reach statement: **It is visible at /{slug} and findable in the registry.**
- Detail heading: **What was published**.
- Primary action: **View public page**.
- Secondary labels: `Copy public link`, `Manage or correct page`.
- Boundary copy: **Publishing a page does not turn on agent actions or confirm price, timing, or availability. The business confirms whether and how it can help.**
- Never say `live with every agent`, `routeable`, `ready to receive work`, `customers and assistants can reach you` unless the loader proves an admitted contact capability, `onboarded supply`, `leads are active`, or `claim complete` as a universal capability state.

## Responsive

The details `<dl>` may use two columns at `sm` and one column below. URL wraps anywhere without horizontal scrolling. At ≤375px, copy and view controls stack full-width, with `View public page` primary. No sticky rail. At 200% zoom, status, URL, details, boundary, and actions remain in the same reading order.

## Accessibility

One `h1`; status is text-first and may add shape/color. Details use `<dl>`. URL is a real link with visible text. Timestamp uses `<time dateTime>` and shared formatter. Copy result uses one polite announcement; errors use one alert. No confetti or entrance motion; reduced-motion state is immediate. All targets are at least 44px and focus-visible.

## Rule compliance

| Rule | How `/claim/success` satisfies it |
|---|---|
| LAW-3 | Available, not found, unavailable, and access states each have facts, next transition, action/recovery, timestamp/identity where known. |
| LAW-4 | Says published/findable only; unknown readback is not failure; no routeability or availability claim. |
| LAW-6 | Loader-backed readback is durable and reachable; toast is copy feedback only. |
| LAW-7 | Publication summary is primary; exact published facts are deeper. |
| IA-1 | Owner activation success route, noindex. |
| IA-5 | Excluded from sitemap; public business page is canonical share target. |
| IA-6, IA-7 | Focused record in public shell, `max-w-5xl`, named gutters/rhythm. |
| IA-8 | Route owns loader/search/SEO; record composition is reusable. |
| AX-2 | View/copy are nonconsequential link/copy interactions. |
| AX-5 | Success follows authoritative readback, not optimistic toast. |
| AX-7 | Business-confirmation and capability boundaries appear in the success record. |
| DS-1, DS-2, DS-3 | Astryx behavior, Tailwind layout, semantic aeTheme tokens. |
| DS-7, DS-8 | Central text-first status and shared timestamp. |
| DS-13, DS-14 | Not-found/unavailable/access meanings are distinct; skeleton and errors retain geometry/context. |
| DS-15 | Truthful reach, no fake activity, 44px targets. |
| PRODUCT rule 7 | Registration/publication is stated as necessary discoverability, never sufficient routeable supply. |
| WEDGE R1 | No fan-out, comparison-of-responses, procurement, payment, wallet, or future capability UI. |

## Anti-slop check

No side stripes, gradient text, glass, hero metric, identical card grid, or modal-first pattern. There is no confetti, giant decorative checkmark, fake reach metric, or celebratory dashboard. The category-reflex check rejects the generic onboarding-success template; the page earns trust through canonical URL, exact published fields, loader-backed status, and honest capability boundaries.
