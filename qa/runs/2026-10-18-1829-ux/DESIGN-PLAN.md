# UX formatting pass

The user's focus is visual UX: formatting, hierarchy, spacing, alignment, and responsive composition. `docs/DESIGN.md` remains authoritative. Earlier bug fixes remain in the working tree.

## Design direction before implementation

- Color: preserve warm tan #DDCABC, forest #1f5a3c, muted forest #425b49, light surface #fffef9, mint #eaf5d9, and raspberry #d93467 through existing tokens.
- Type: retain Trebuchet MS / Segoe UI; use the existing heading scale, readable body line heights, and smaller supporting metadata. Fix accidental font resets and cramped/wrapped labels.
- Layout: preserve focal centered Home/matching screens; align form labels and inputs within readable widths; keep record names, metadata, and actions legible. Compact screens retain one pane and navigation clearance; expanded screens retain existing columns.
- Controls: use existing semantic components, 14px control and 18px record/dialog guidance, visible focus, and 44px targets. Keep common actions coherent across features.

```text
Discovery              Forms                  Records
[corner controls]      [title]                [avatar] [name]
[     artwork    ]     [label]                [       preview   ]
[ state + action ]     [input             ]   [       metadata  ]
                       [footer actions    ]
```

## Review against the product brief

The supplied art, calm composition, palette, type, and 800px shell boundary already define Pebble. Improve observed defects within that design: clipped content, broken avatar selectors, inconsistent native link colors, excessive or collapsed spacing, narrow record columns, and crowded modal actions. Preserve generous intentional space, prototype fixtures, and product behavior. Findings require screenshots and concrete proposed edits; tiny taste differences are deferred.

## Verification

Review actual screenshots at narrow phone, typical phone, tablet/breakpoint, short desktop, and wide desktop sizes. Make meaningful browser assertions for clipping, wrapping, reachability and overflow. Use the existing checks and compare against the existing 19-failure browser baseline. Cosmetic-only edits receive visual review rather than implementation-mirroring unit tests.
