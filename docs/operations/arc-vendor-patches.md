# Arc vendor patches

This ledger lists every `// arc-patch:` marker under `src/components/arc/`, generated from the source on 2026-10-07. Each patch is a minimal accessibility or semantic change on top of the registry file. Re-apply it after any resync. The per-wave notes are in [arc-patches/](arc-patches/).

## `src/components/arc/accordion/accordion.tsx`

- line 38: Closed panels leave focus navigation and the accessibility tree immediately.

## `src/components/arc/alert/alert.tsx`

- line 74: honor caller role overrides and keep rich child markup out of paragraphs.

## `src/components/arc/blocks/faq-section/faq-section.tsx`

- line 29: preserve authored heading ids and omit headings without dangling section labels.

## `src/components/arc/chip-group/chip-group.tsx`

- line 193: keep an exiting overflow control out of the keyboard and interaction model.
- line 229: return focus before collapse removes the focused overflow control.

## `src/components/arc/combobox/combobox.tsx`

- line 52: Keep exiting popover content inert and hidden from assistive technology.
- line 58: Keep an exiting clear action out of keyboard and assistive-technology navigation.
- line 93: Retain listbox refs for all valid string values, including object-prototype keys.
- line 191: ArrowUp from no active option starts at the final enabled option.
- line 209: Keep Escape on the combobox before an enclosing overlay handles it.

## `src/components/arc/donut-chart/donut-chart.module.css`

- line 32: Preserve the repository's 44px minimum target for legend controls.

## `src/components/arc/empty-state/empty-state.module.css`

- line 6: carry the existing title treatment across supported title elements.

## `src/components/arc/empty-state/empty-state.tsx`

- line 17: preserve caller-owned live-region and title semantics.

## `src/components/arc/filter-toolbar/filter-toolbar.tsx`

- line 183: Keep outgoing menu-step controls out of the accessibility tree and keyboard order.
- line 397: Keep exiting chip and Clear all controls out of the accessibility tree and keyboard order.
- line 403: Prevent the outgoing Back control from remaining exposed or tabbable during its exit.
