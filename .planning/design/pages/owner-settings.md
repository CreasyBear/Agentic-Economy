# /owner/settings — Settings

## Register & scene

**Product register, compact density.** A business administrator updates contact and notification rules on a laptop in a quiet, daylight office with time to verify consequences; a warm-canvas page and white form surface use ink for labels, slate for explanatory boundaries, and eucalyptus only for active navigation, focus, and save actions.

## Job & IA position

**One job:** maintain the business profile and purpose-bound operational notification choices without accidentally changing publication or request acceptance.

- **Route class:** authenticated operator in `AeOperatorShell`; `noindex`.
- **Entry points:** owner navigation `Settings`, Requests suppression banner, Business status corrections, notification deep links.
- **Exits:** business status, requests, public business page, sign out.
- **Blueprint:** IA-6 focused form inside operator shell; IA-7 `max-w-5xl`, D5/DS-12 form contract, LAW-7 summary plus policy detail, JOURNEY A11 notification cessation.
- Profile, request acceptance, and notification preferences are separate objects and save boundaries. A personal notification toggle never silently mutates the business-wide request default (anti-pattern 10).

## Layout

`AeOperatorShell`; `max-w-5xl mx-auto px-4 md:px-6`; at `md+`, 12-column layout with a 3-column in-page section navigation and 9-column form. Sections are one continuous form document separated by headings and rules, not identical cards. A sticky save bar appears only when a section is dirty and never obscures the field/error it applies to.

### Desktop, ≥768px

```text
┌──────────────────────── AeOperatorShell / max-w-5xl ────────────────────┐
│ side nav │ Settings                                      [Saved 09:42] │
├──────────┴──────────────────────────────────────────────────────────────┤
│ ┌── section nav 3 cols ──┬──────── form document 9 cols ─────────────┐ │
│ │ Profile                 │ Profile                                  │ │
│ │ Notifications           │ Business name [________________________] │ │
│ │ Request availability    │ Public contact [_______________________] │ │
│ │                         │ Service area [__________________________] │ │
│ │                         │ [Save profile]                           │ │
│ │                         ├──────────────────────────────────────────┤ │
│ │                         │ Notifications                            │ │
│ │                         │ Email for new customer response   [on]  │ │
│ │                         │ Email for delivery attention      [on]  │ │
│ │                         │ Browser notifications             [off] │ │
│ │                         │ Purpose, channel, cessation policy       │ │
│ │                         │ [Save notification settings]             │ │
│ │                         ├──────────────────────────────────────────┤ │
│ │                         │ Request availability                     │ │
│ │                         │ Accept new customer requests       [on] │ │
│ │                         │ Existing records remain readable         │ │
│ │                         │ [Save request availability]              │ │
│ └─────────────────────────┴──────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Mobile, ≤375px

```text
┌──────────────── 375 ────────────────┐
│ [Menu] Settings                     │ 56
│ [Profile] [Notifications] [Requests]│ 44
├─────────────────────────────────────┤
│ Profile                             │
│ Business name                       │
│ [_______________________________]   │ 44
│ Public contact                      │
│ [_______________________________]   │ 44
│ Service area                        │
│ [_______________________________]   │ 44
│ [Save profile]                      │ 44
├─────────────────────────────────────┤
│ Notifications                       │
│ New customer response          [on] │ 52
│ Delivery needs attention       [on] │ 52
│ Browser notifications         [off] │ 52
│ Closing a request stops updates…    │
│ [Save notification settings]        │ 44
├─────────────────────────────────────┤
│ Request availability                │
│ Accept new customer requests   [on] │ 52
│ Existing records stay available     │
│ [Save request availability]         │ 44
└─────────────────────────────────────┘
```

At mobile width, section links horizontally scroll only if needed and expose a visible overflow cue. Each section is still in document order; links are anchors, not route-like tabs that hide unsaved sections.

## Section anatomy

1. **Page header and save readback**
   - Content: `Settings`, selected business, last successful save time, global server-error summary only when needed.
   - Data: route loader identity and settings version.
   - Astryx: `Heading`, `Text`, `Banner`, shared `AeTimestamp`.
2. **Profile form**
   - Content: published business name, public contact posture, service area, business description and other currently supported profile fields. Each field marks whether it appears publicly. Profile save does not publish/unpublish or alter request acceptance.
   - Data: route loader profile projection; route action with optimistic concurrency/version.
   - Astryx: `FormLayout`, `TextField`, `TextArea`, `Select` where source options exist, `Button`; field help via `Text`, not tooltips for essential meaning.
3. **Notification settings**
   - Content: operational event-by-channel controls, each naming event, channel, purpose, and opt-out effect. Minimum R1 controls: email for `New customer response`, email for `Delivery needs attention`, optional browser notification only after permission; SMS appears only if the real channel is configured and separately chosen. Marketing consent is absent and cannot be bundled.
   - Data: route loader purpose-bound notification preferences and verified channel state; route action.
   - Astryx: `FormLayout`, `Switch` or `Checkbox` with persistent label/description, `Button`, `Banner`, `Collapsible` for `When notifications stop`.
<!-- journey-system: A3/A6/C4 -->
3a. **Notification deep-link receiver contract**
   - The route MUST accept only the canonical owner envelope fields `event`, `purpose`, and signed `focus`, plus an allowlisted section target. The canonical notification target remains `/owner/inquiries/$threadId`; settings is a receiver only for notification-preference or channel-recovery events whose `purpose` authorizes this route.
   - `event` MUST name the exact triggering event; `purpose` MUST identify the purpose-bound notification scope; `focus` MUST resolve to a permitted setting control or item target without exposing raw object data in the URL. The receiver MUST validate audience, signature, expiry, purpose-to-route permission, and section allowlist before focusing anything.
   - Allowed section focus values are `notifications`, `notification-channel-{channel}`, and `notification-event-{event}` after server resolution to an existing control. Unknown, expired, foreign, or unauthorized values MUST degrade to the Notifications heading with an orientation Banner naming the safe event/purpose context; they MUST NEVER reveal whether a foreign business, thread, channel, or item exists.
   - If authentication is required, sign-in MUST preserve one redirect-safe canonical URL with the validated envelope. After return, focus MUST move to the resolved heading/control, its description MUST remain visible, and assistive technology MUST receive one polite orientation announcement. Missing or invalid focus MUST NOT block ordinary settings use.
   - Owner channel policy is read-only here until the owner commits `Save notification settings`: configured purpose-bound channels determine delivery, and one AE notification-outbox dispatch authority owns each channel attempt. The UI MUST NEVER imply that two providers independently dispatch the same event.
   - Data: validated notification deep-link envelope, owner authorization context, configured channel projection, and audience-scoped visit cursor.
   - Astryx: `Banner`, `Heading`, `AeRouteFocusManager`, and existing labelled notification controls; no transient toast-only orientation.
4. **Notification cessation rules (A11)**
   - Content, always visible summary: `Closing or withdrawing a request stops unsent updates for that request before the next dispatch, no later than one minute. A late reply may remain in the record, but notifications do not restart without a new purpose-bound choice.` Detail disclosure names expiry/close behavior, channel-specific opt-out, and that legally/operationally required records may remain without marketing use.
   - Data: policy projection from the notification cessation clock and current preference effective times.
   - Astryx: `Text`, `Collapsible`, `Badge` for effective posture, shared timestamp. This is policy readback, not a toggle.
5. **Request availability and suppression**
   - Content: business-wide `Accept new customer requests`; current status, effective time, and consequence. Turning off states: no new R1 request will be offered/sent to this business; existing requests and records remain readable; current customer conversations are not silently deleted. Turning on does not promise search placement or incoming volume and requires a verified destination.
   - Data: route loader business acceptance/suppression and verified-destination posture; route action.
   - Astryx: `FormLayout`, `Switch`, `Banner`, `Button`, `Dialog` only if pausing immediately changes externally visible eligibility and policy requires consequence confirmation.
6. **Privacy and active sessions link-outs**
   - Content: only currently implemented links to privacy/access management. No speculative account/security dashboard.
   - Data: route loader route/action registry.
   - Astryx: `RouterLink`, `Button` link style.

## States

- **Loading:** shell, page header, section navigation, exact label/control skeleton rows, and save-button placeholders preserve form geometry. Controls are not focusable until values are authoritative.
- **Empty, no source data:** if profile has no data, render labelled blank fields with `Add business details`; this is a valid first-edit state, not an ornamental empty card.
- **Empty, unavailable channel:** `Browser notifications are not available in this browser.` Keep email choices usable. Do not show unsupported SMS controls. This is `temporarily unavailable` or `no source data` according to actual channel configuration.
- **Access denied:** retain shell; `You do not have permission to change settings for this business.` Offer `Switch business` or the actual administrator path.
- **Resource not found:** non-enumerating `Business settings not found.` Safe action `Back to business status`.
- **Error:** field validation is local. Server failure produces one summary Banner while preserving typed values. Version conflict says `These settings changed in another session`; action `Review latest settings`, never silent overwrite.
- **Saving:** only the active section is `aria-busy`; its commit is disabled and labelled `Saving…`; other sections remain readable but cannot submit conflicting writes to the same object.
- **Saved:** durable inline `Saved {time}` readback near the section; toast is optional acknowledgement only.
- **Zero-JS/SEO:** authenticated server-rendered forms, `noindex`; each section has its own form action and named submit. Browser permission request requires JS and is hidden/replaced by explanatory copy without it. Anchor navigation and validation remain functional.

## Interactions

### Save boundaries

- **Profile primary action:** `Save profile`. Inline confirmation is sufficient because editing is reversible; changing a field marked public repeats its public visibility beside the field. Consequential publication changes route to Business status rather than being smuggled into Save.
- **Notifications primary action:** `Save notification settings`. The readback immediately above it lists changed event/channel pairs and effective opt-out. Disabling a channel is reversible and inline; browser permission is requested only after the owner explicitly enables that event channel.
- **Request availability primary action:** `Save request availability`. If changing from accepting to paused, show consequence adjacent: `New customer requests will stop. Existing requests and records remain available.` Use inline confirmation by default; use `Dialog` only if runtime policy makes the change immediately externally consequential and irreversible for in-flight offers. The named dialog action is `Pause new customer requests`, never `Confirm`.
- Each form follows `FormLayout`: field-local `aria-invalid`/`aria-describedby`, focus first invalid, preserve values, server-failure Banner, disabled/loading submit.
- D5 navigation blocker activates only for dirty consequential form state. It names the section and loss: `Leave without saving notification settings?` Profile short-form state may use session recovery if implemented. Save success clears the blocker.
- No keyboard shortcuts. Standard form controls and visible save actions are sufficient; Enter submits only when the focused control and form semantics make that unambiguous. Escape never clears changes.

## Copy voice

- Headline: **Settings**
- Sections: **Profile**, **Notifications**, **Request availability**, **When notifications stop**.
- Notification labels: **New customer response**, **Delivery needs attention**, **Email**, **Browser notification**. Descriptions name purpose: `Operational updates for this customer request`, never generic engagement.
- Cessation copy: **Closing or withdrawing a request stops future notifications for that request. A late reply can remain in the record, but notifications will not restart unless you make a new purpose-bound choice.**
- Suppression copy: **Pause new customer requests**; **Existing requests and records remain available.** Resume copy: **Accept new customer requests**; **This does not promise search placement, availability, or incoming requests.**
- Boundary copy near request availability: **Your business confirms price, timing, availability, and whether it can help.**
- No lead, campaign, blast, funnel, wallet, payment, booking, procurement, fan-out, or internal item/receipt/tuple/lifecycle/mandate copy. `Request` is acceptable on this operator surface.

## Responsive

- `md+`: 3/9 section-nav/form grid; nav may stick below shell header. Form prose caps at 70ch.
- `<md`: anchor links become a compact horizontal section strip; all sections remain in one vertical document. Save controls are full-width only where needed, not oversized by default.
- Dirty save bar, if used, is in normal flow at ≤375px and does not become a viewport-obscuring fixed footer.
- Labels remain above controls on narrow screens. Switch label and description occupy the left; control stays aligned to the first label line with a ≥44px combined hit target.
- No horizontal overflow at 320px/375px or 200% zoom. Error text wraps; section anchors scroll with shell-header offset.

## Accessibility

- `<main>` has one `h1`; section navigation is `<nav aria-label="Settings sections">`; each section is an `h2` and independent `<form>` with an accessible name.
- Persistent visible labels and descriptions; essential consequences are never tooltip-only. Switches expose current checked state and associated help. Browser permission denial has a visible recovery/explanation.
- One polite live region announces `Profile saved`, `Notification settings saved`, or `New requests paused`; it does not echo every toggle. Validation summary receives focus only after failed submit; field errors remain associated.
- Navigation blocker and any consequence dialog name unsaved data/action, trap focus, support cancel, and restore focus. Disabled controls show why.
- Reduced motion makes anchor/disclosure/save-state changes immediate. Timestamps use `<time dateTime>` and shared formatting. Status/consent never relies on color alone.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-3, LAW-4 | Acceptance and notification postures state facts, next transition, time, and limits without implied volume/outcome. |
| LAW-5, LAW-7 | Changed public/notification/request scope appears beside named save; summary plus policy detail only. |
| LAW-8, LAW-10 | Channel/access empties teach recovery; navigation and settings links derive from route registry. |
| IA-1, IA-2, IA-6–IA-8 | Authenticated operator route, focused form width, standard gutters, thin route and reusable forms. |
| AX-2–AX-4, AX-7 | Reversible inline saves; modal only if consequence demands it; named actions and symmetric opt-out; adjacent business boundary. |
| DS-1–DS-6 | Astryx form/overlay behavior, Tailwind layout, semantic tokens, complete states, Astryx motion and reduced-motion branch. |
| DS-7, DS-8, DS-12–DS-15 | Central status, shared time, one form contract, meaningful empties, stable skeletons/errors, 44px targets. |
| D5 | Dirty consequential forms block navigation and state what would be lost; short recoverable form may use session recovery. |
| JOURNEY-SYSTEM C4 / JOURNEY §6.2 | Both-audience notification envelope is validated; owner `event`/`purpose`/signed `focus` resolves through a redirect-safe canonical URL to an allowlisted setting target; one dispatch authority owns configured channels. |
| JOURNEY A11 | Close/withdraw cessation, ≤1 minute policy, no late-reply restart without new purpose-bound choice. |
| WEDGE-LADDER A4/R1 | Explicit acceptance/suppression, verified destination dependency, and single-business request posture only. |

## Anti-slop check

No side-stripe accents, gradient text, glass, hero metrics, identical card grids, ornamental settings tiles, decorative motion, or modal-as-first-thought. The settings document uses conventional fields and independent save boundaries rather than bespoke controls. Eucalyptus is reserved for focus/current/commit states. The daylight administrative scene determines a restrained light form, avoiding both generic dark-tool reflex and generic teal settings-dashboard styling.
