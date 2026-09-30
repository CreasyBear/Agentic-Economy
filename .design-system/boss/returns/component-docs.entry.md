Status: complete with NEEDS REVIEW (9)
Commit: none
<!-- Draft: coordinator diagnostic sample; not published. -->

## Description
Button triggers an in-place action through Base UI's button primitive and applies shared style and size classes.

`import { Button } from "@/components/ui/button";`, client side through `@base-ui/react/button` (its entry is marked `'use client'`), source `src/components/ui/button.tsx`, status NOT SUPPLIED (no `registry.json` found).

## Examples
Default example, simplified from `src/components/ae/shared/QuoteConfirmation.tsx:47`:

```tsx
<Button type="button" disabled={view.pending} onClick={() => onApprove(view.callRef)}>Approve this Call</Button>
```

- Market error state: retry the failed market load; `variant="default"`, `size="default"`. `src/routes/market.tsx:56`

```tsx
<Button type="button" className="min-h-touch" onClick={reset}>
  Try again
</Button>
```

- Chat pending Call confirmation: approve or deny the current Call; default approve button and outline cancel button. `src/components/ae/chat/chat-session/components/ChatApprovalCards.tsx:42`, `src/components/ae/shared/QuoteConfirmation.tsx:47`

```tsx
<Button type="button" className="min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center" disabled={view.pending} onClick={() => onApprove(view.callRef)}>Approve this Call</Button>
<Button type="button" variant="outline" className="min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center" disabled={view.pending} onClick={() => onDeny(view.callRef)}>Not now</Button>
```

- Command Panel Tool detail: copy the suggested request text; default variant, `size="sm"`; caller changes the visible and accessible label after copying. `src/components/ae/command-panel/pages/ToolDetailPage.tsx:90`, `src/components/ae/market/tool-detail/AeToolInspector.tsx:58`, `src/components/ae/market/tool-detail/AeToolCompactDecision.tsx:72`

```tsx
<Button
  type="button"
  size="sm"
  className="min-h-touch w-fit self-start"
  aria-label={isCopied
    ? `${model.nextAction.label} copied`
    : `Copy ${model.nextAction.label}`}
  onClick={() => { void copy() }}
>
  {isCopied ? (
    <CheckIcon aria-hidden="true" data-icon="inline-start" />
  ) : (
    <CopyIcon aria-hidden="true" data-icon="inline-start" />
  )}
  {isCopied ? 'Copied' : model.nextAction.label}
</Button>
<span role="status" aria-live="polite" className="text-xs text-muted-foreground">
  {status === 'failed' ? 'Copy failed. Open full Tool details to copy the request manually.' : ''}
</span>
```

### Example files
| File | Covers | Caption |
|---|---|---|
| NOT SUPPLIED: no Button story or example file was found; the assigned scope excludes creating examples | `variant="default"`, `size="default"` | none |
| NOT SUPPLIED: no Button story or example file was found | `variant="destructive"` | none |
| NOT SUPPLIED: no Button story or example file was found | `variant="outline"` | none |
| NOT SUPPLIED: no Button story or example file was found | `variant="secondary"` | none |
| NOT SUPPLIED: no Button story or example file was found | `variant="ghost"` | none |
| NOT SUPPLIED: no Button story or example file was found | `variant="link"` | none |
| NOT SUPPLIED: no Button story or example file was found | `size="xs"` | none |
| NOT SUPPLIED: no Button story or example file was found | `size="pill"` | none |
| NOT SUPPLIED: no Button story or example file was found | `size="sm"` | none |
| NOT SUPPLIED: no Button story or example file was found | `size="lg"` | none |
| NOT SUPPLIED: no Button story or example file was found | `size="icon"` | none |
| NOT SUPPLIED: no Button story or example file was found | `size="icon-xs"` | none |
| NOT SUPPLIED: no Button story or example file was found | `size="icon-sm"` | none |
| NOT SUPPLIED: no Button story or example file was found | `size="icon-lg"` | none |
| NOT SUPPLIED: no Button story or example file was found | default state | none |
| NOT SUPPLIED: no Button story or example file was found | hover | none |
| NOT SUPPLIED: no Button story or example file was found | focus-visible | none |
| NOT SUPPLIED: no Button story or example file was found | active/pressed | none |
| NOT SUPPLIED: no Button story or example file was found | disabled | none |
| NOT SUPPLIED: no Button story or example file was found | `aria-invalid` | none |
| NOT SUPPLIED: no Button story or example file was found | `prefers-reduced-motion` | none |
| NOT SUPPLIED: no Button story or example file was found | Button pair inside the Quote confirmation card footer | none |

## Variants

### variant
- `default` — uses the primary action fill and foreground classes. In the light theme, `primary` resolves to the charcoal action token; the source does not state which actions must use this value.
- `destructive` — uses destructive fill and foreground classes; when to choose it is NOT SUPPLIED.
- `outline` — uses a background, border and small shadow, with accent hover classes; when to choose it is NOT SUPPLIED.
- `secondary` — uses the secondary surface and foreground classes; when to choose it is NOT SUPPLIED.
- `ghost` — has no base fill class and uses accent hover classes; when to choose it is NOT SUPPLIED.
- `link` — uses primary text and adds an underline on hover; it remains a Button primitive unless the caller chooses another rendering.

### size
- `default` — `h-10 px-5`, with reduced horizontal padding when the child contains an SVG.
- `xs` — `h-6`, tighter gap and padding, and `text-caption`.
- `pill` — `h-10 rounded-full`, with a border, card background and responsive horizontal padding.
- `sm` — `h-8`, tighter gap and padding.
- `lg` — `h-12 px-6`.
- `icon` — square `size-10` dimensions.
- `icon-xs` — square `size-6` dimensions.
- `icon-sm` — square `size-8` dimensions.
- `icon-lg` — square `size-12` dimensions.

The base class adds `max-sm:min-h-touch`, which resolves to 44px in the project theme. It applies across size values at the configured `max-sm` breakpoint. The source does not document what task should choose each size.

## States
- Default: `data-slot="button"`, `data-variant` and `data-size` are rendered; omitted `variant` and `size` become `default`.
- Hover: each variant supplies its own hover class. The shared Button transition uses `duration-fast` over color, background, border, shadow, opacity and transform; its theme value is 150ms. The separate `DESIGN.md` hover sentence and the website-only ink-wash implementation are unresolved in Conflicts.
- Focus-visible: a solid 2px outline with 2px offset uses the ring token.
- Pressed: `active:scale-[0.96]`; if `disabled` and active styles coincide, `disabled:active:scale-100` resets the scale.
- Disabled: Base UI defaults `disabled` to false and `focusableWhenDisabled` to false. When disabled, the shared classes remove pointer events and apply 50% opacity; Base UI prevents the click handler. A disabled pointer target cannot reach hover through pointer input.
- Invalid: `aria-invalid` adds a destructive border and ring. It can coexist with focus-visible; the combined browser rendering was not observed, so precedence is NEEDS REVIEW.
- Pending: Button has no pending prop or built-in pending state. The Quote confirmation caller maps `view.pending` to `disabled`; it keeps the same label while pending.
- Success/failure: Button has no built-in result state. The copy caller changes its text and accessible name on success and places failure feedback in a polite status region.
- Content edge: base classes use `whitespace-nowrap`; Quote confirmation opts into wrapping and automatic height through `className`. No maximum supported label length was measured.
- Narrow viewport: `max-sm:min-h-touch` adds the project touch minimum; the breakpoint, resulting layout and wrapping limit were not browser-checked.
- Empty children: the wrapper does not provide a fallback accessible name. No empty-content call was supplied.
- Reduced motion: `motion-reduce:transition-none` and `motion-reduce:active:scale-100` disable transition and pressed scaling.
- Pressed + hover may occur together; the source assigns scale and color/background changes to separate properties. Focus-visible + invalid also may occur together; their final rendered outline/ring treatment is NEEDS REVIEW without a browser read.

## Props
| Name | Type | Default | When to change it |
|---|---|---|---|
| `variant` | `VariantProps<typeof buttonVariants>["variant"]` | `"default"` | Change the visual treatment; selection criteria are NOT SUPPLIED. |
| `size` | `VariantProps<typeof buttonVariants>["size"]` | `"default"` | Change geometry and, for `pill`, border/background treatment. |
| `className` | `ButtonPrimitive.Props["className"]` | none | Add or merge caller classes. The wrapper applies `cn(buttonVariants(...), className)`, and `cn` uses `twMerge`; Base UI's state-callback form is not shown in a caller and its path through `cn` is NEEDS REVIEW. |
| `render` | `ButtonPrimitive.Props["render"]` | none | Replace or compose the rendered element. |
| `nativeButton` | `boolean` | `true` | Set false only when a custom rendered element is not a native `<button>`. |
| Base UI props | `ButtonPrimitive.Props` | Base UI defaults | Pass native button props such as `type`, `disabled`, `onClick`, children, ARIA attributes, and `focusableWhenDisabled`. Base UI sets `type="button"` in native mode; `disabled` and `focusableWhenDisabled` default to false. |

## Usage

### When to use
- The user needs to retry an in-place operation, as in the Market error boundary.
- The user needs to approve or deny a pending Call in the current chat.
- The user needs an in-place action such as copying Tool request text.

### When not to use
- When activation should navigate to a Tool detail resource, use TanStack `Link` instead; `AeToolCompactDecision` renders a Link for its navigate action and a Button for copying. Market sort and page controls use Buttons for in-place query-state changes.

### Rules
NEEDS REVIEW: the supplied code names visual variants but does not state a tested rule that maps `default`, `destructive`, `outline`, `secondary`, `ghost` or `link` to action priority, risk or surface. This diagnostic sample did not run the required complete call-site falsification, negation and sweep, so it adds no usage rule.

### Content
The wrapper renders caller children and does not set a label. Supplied labels include “Try again”, “Approve this Call”, “Not now”, “Copied” and “Compare”. `DESIGN.md` requires sentence case for interface copy; this sample does not establish a general label-length or forbidden-word rule.

### Anti-slop
NEEDS REVIEW: no fresh-agent task comparison was run, so this entry does not claim which Button code agents would otherwise invent.

### Limits
NEEDS REVIEW (not measured): no browser probe measured label length, wrapping, target bounds across breakpoints, nested composition, locale expansion or dense placement. Source shows `whitespace-nowrap` by default and actual callers that override it for wrapping.

## Accessibility
The source wraps Base UI `Button`; Base UI documents and implements a native `<button>` by default. The wrapper sets `nativeButton=true`. Native mode sets `type="button"`, and Base UI disables `onClick` when `disabled` is true. Its implementation marks itself client-side.

For the default native element, the role is `button`, and Enter and Space activate it through native button behavior. The wrapper supplies no accessible name: use visible text or a caller-provided `aria-label` for icon-only controls. Focus remains with native browser behavior; focus order, spoken name, disabled announcements, state timing and post-activation focus were not read from a browser accessibility tree, so those details are NEEDS REVIEW.

`render` can replace or compose the element, and `nativeButton=false` changes Base UI's semantics to non-native button handling. Role and keyboard behavior therefore depend on that caller composition. The supplied real-use examples use the default native button path.

## Tokens
Color: `bg-primary`, `text-primary-foreground`, `bg-destructive`, `text-destructive-foreground`, `bg-background`, `bg-secondary`, `text-secondary-foreground`, `hover:bg-accent`, `hover:text-accent-foreground`, `text-primary`, `focus-visible:outline-ring`, `aria-invalid:border-destructive`, `aria-invalid:ring-destructive/20`, `border-border/70`.

Typography: `font-sans`, `font-medium`, `text-caption`.

Shape and elevation: `rounded-md`, `shadow-xs`.

Motion: `duration-fast`, `ease-standard`.

Target size: `min-h-touch`.

`border-border/70` and `aria-invalid:ring-destructive/20` are role tokens with alpha. No palette-step utility appears in the Button variant source. Numeric utilities such as `h-10`, `px-5` and `size-10` are not listed as named project tokens.

## Related
- TanStack `Link`: choose it for navigation to a destination; use `buttonVariants` to share Button styling when needed.
- `AeSiteButton`: choose it for the website button treatment with `filled`/`outlined`, shape artwork and the `data-ae-site-button` hover layer. It has a distinct API and implementation from the shared Button.

**Sources**
- Code: `src/components/ui/button.tsx` and `src/components/ui/button-variants.ts`, read at checkout `e1f2b3f59`, 2026-09-30 10:15:35 AWST.
- Primitive types/runtime: `node_modules/@base-ui/react/button/Button.d.ts`, `Button.js`, `ButtonDataAttributes.d.ts`, `node_modules/@base-ui/react/internals/types.d.ts` and `node_modules/@base-ui/react/internals/use-button/useButton.js`, read 2026-09-30 10:19:59–10:23:32 AWST.
- Class merging: `src/lib/utils.ts`, read 2026-09-30 10:23:54 AWST.
- Documentation/token method: `/Users/joelchan/.agents/skills/component-docs/SKILL.md`, its `references/doc-format.md` and `references/sources.md`, and `/Users/joelchan/.agents/skills/token-mapping/SKILL.md` plus `references/mapping-rules.md`; read during this run. The format and source method were read by 10:15:03 AWST; token-mapping rules by 10:16:03 AWST.
- Style tokens: `src/styles/globals.css` and `src/styles/base.css`, read 2026-09-30 10:19:16 and 10:25:01 AWST.
- Project design contract and rules: `DESIGN.md` and `AGENTS.md`, read 2026-09-30 10:15:03 AWST.
- Real uses: `src/routes/market.tsx:56`, `src/components/ae/shared/QuoteConfirmation.tsx:45`, `src/components/ae/chat/chat-session/components/ChatApprovalCards.tsx:42`, and Tool detail path `src/components/ae/command-panel/pages/ToolDetailPage.tsx:90` → `src/components/ae/market/tool-detail/AeToolInspector.tsx:58` → `src/components/ae/market/tool-detail/AeToolCompactDecision.tsx:72`, verified by source reads/search 2026-09-30 10:15:35–10:25:46 AWST.
- Market state controls: `src/components/ae/market/AeX402Directory.tsx:517` and `:569`, found by search 2026-09-30 10:22:32 AWST; the Button changes sort or page query state.
- Assigned candidate use: `src/components/ae/shared/ToolListingCard.tsx:33`, `src/components/ae/shared/HostGrouping.tsx:22`, `src/components/ae/shared/ProviderPortfolio.tsx:14`; searched/verified 2026-09-30 10:17:35 AWST.
- `className` type evidence: `node_modules/clsx/clsx.d.ts`, read 2026-09-30 10:29:43 AWST; its `ClassValue` union does not include a function.
- Example search: `rg --files` found no Button story/example or `registry.json`; the only name match was `tests/unit/website/site-button.test.tsx`, not the shared Button, checked 2026-09-30 10:23:44 AWST.

**Conflicts**
- Hover treatment and duration: `DESIGN.md` says “button hover” is a 260ms ink wash. Shared `buttonVariants` instead declares a `duration-fast` transition, which `globals.css` resolves to 150ms and applies to color/background/border/shadow/opacity/transform. The separate website `AeSiteButton` has the ink-wash layer, while `base.css` resolves its layer transition through `--motion-duration-base` (220ms). No project rule says which Button the 260ms statement names or resolves the duration mismatch; not chosen.
- Candidate real use `ToolListingCard`: the assigned file conditionally renders ghost Save/Compare buttons when callbacks exist. Its only current consumers found, `HostGrouping` and `ProviderPortfolio`, pass only `view`, so neither action button is rendered through those consumers. No source establishes a current screen using those Button instances; not counted as a real rendered Button use.
- `className` callback: Base UI's `ButtonPrimitive.Props` allows a state callback, while the wrapper sends `className` through `cn` and `clsx`'s `ClassValue` type has no function member. No type check was run to settle whether this public prop is rejected or dropped; not chosen.

**Guessed at**
- The “compact” intent for `xs` and the icon intent for `icon*` are inferred from prop names and class geometry; no usage description or story settles when to choose them.
- The `variant` names are documented as visual classes only; their action-priority and risk semantics are not inferred.
- `max-sm:min-h-touch` is described as a narrow-viewport touch minimum from the class name and theme mapping; its actual layout outcome has not been rendered or measured.
- Accessibility role and keys are stated from the installed Base UI source and native button semantics. Screen-reader output, focus behavior and rendered combinations remain unobserved.
- Base UI's state-callback `className` typing may not be preserved by the wrapper's `cn` call; no app callsite or type check settles the behavior.
- No app-specific Anti-slop comparison was run; no claim is made about a fresh agent's defaults.
- Example files were not created because the assigned scope names only this entry file.

**Gates**
- Does the 260ms ink-wash contract apply to the shared Button, the website `AeSiteButton`, or both? Default: the shared Button follows its current 150ms `duration-fast` classes; treat `AeSiteButton` as a separate 220ms ink-wash implementation until the design contract is clarified.
- Should `ToolListingCard` Save/Compare be documented as a current real use? Default: no, until a current consumer passes `onSave` or `onCompare`.
- Which action jobs map to each `variant` and `size` value? Default: document their present classes and caller-selected values only; add no semantic selection rule until current app evidence or a design decision supplies it.
- Should the shared wrapper support Base UI's state-callback `className` form? Default: expose only behavior demonstrated by current string-class callers until the type/runtime path is checked.
