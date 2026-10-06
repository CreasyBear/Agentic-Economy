# Arc vendor patches

Vendored Arc files are upstream-pristine unless listed here as **PATCHED**. Focus-visible treatment belongs in AE edge CSS, never in a vendor patch.


## Accordion — PATCHED (E1-14)

- **Diff:** add `inert={!open}` and `aria-hidden={!open}` to the mounted motion panel in `src/components/arc/accordion/accordion.tsx`; mark it with `// arc-patch:`.
- **Reason:** `forceMount` retains closed panel content during the exit animation. Removing it from keyboard navigation and the accessibility tree immediately prevents focus from remaining in or moving into a panel as it closes. Existing `.ae-arc :focus-visible` provides AE-owned focus styling.
- **Upstream report:** “Closed panels stay mounted but switch to visibility hidden once collapsed, so they leave the accessibility tree.” Source: [Accordion documentation](https://uiarc.dev/components/accordion/markdown). The upstream `forceMount` exit-animation path does not provide immediate `inert` or `aria-hidden` state.
- **Install evidence:** isolated shadcn install matched the `accordion.tsx` and `accordion.module.css` registry bytes before this a11y patch; CSS remains registry-pristine.

## Chip group — PATCHED (E1-15)

- **Diff:** before a collapse removes the focused `Show less` button, move focus to the first remaining visible chip; mark an exiting overflow button `aria-hidden`, remove it from the tab order, and disable it until exit completes. Inline markers: `// arc-patch:` in `src/components/arc/chip-group/chip-group.tsx`.
- **Reason:** preserve keyboard focus and prevent interaction with an outgoing control absent from the visible/accessibility model. Focus appearance remains AE-owned via `.arc-market :focus-visible`.
- **Upstream report:** “When the expanded `Show less` overflow button is focused and activation collapses the group, it is removed without handing focus to a surviving control. During its exit animation it also remains enabled. Please move focus to a surviving chip before collapse when the overflow control will disappear, and make exiting overflow controls inert to keyboard and pointer interaction.”
- **Install evidence:** isolated shadcn install matched `chip-group.tsx` registry bytes. The CLI omitted the CSS registry's first descriptive comment; it was restored verbatim. The CSS has no AE focus override.

## Kept AE components

None in this slice.
