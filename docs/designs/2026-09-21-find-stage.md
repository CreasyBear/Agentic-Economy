# FIND stage freeze

**Status:** signed by “lets start” 21 September 2026  
**Protocol:** [`buyer-journey-protocol.md`](../operations/buyer-journey-protocol.md)  
**Channel:** Deep — Market, listing return, and compare are one handoff

```text
Stage:           FIND
Arrive carrying: a need
Leave carrying:  one Tool you can explain
                 (contribution, Provider, listed price ≠ Quote, callable?)
Pages in:        /market (entry, cards, compare), /tools/…, /t/* cards
Primary action:
  Market ask    → shortlist
  Card          → open that listing
  Compare       → inspect one of the set
  Listing       → back to the same shortlist; explain the Tool
  Ask card      → same listing
Must agree:      title, Provider, listed price, callable vs indexed
Out:             Quote, Call, credit, dest-count, Provider publish,
                 no-fit dest, discover SoT restyle, chat purchase (JI-04b reviews)
Invariant reviewers: EX-01, JI-04b, x402 indexed ≠ callable
Stage walk:      image generation → shortlist → open one (honest listing)
                 → compare two → refresh → both still there
                 → say what listed price is not, and whether callable
```

**This wave’s Flips:** the compare set lives in `?compare=` and is not stripped. Toggle writes the URL. Filter, search, tab, and Back keep it. Refresh keeps it.

Later FIND work (same stage, after this flip): card/listing fact agreement, honest unavailable, callable mark, chat cards use the same projection.
