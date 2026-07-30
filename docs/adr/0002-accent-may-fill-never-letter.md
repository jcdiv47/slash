# The accent may fill, never letter

Slash's Accent is amber, chosen to read as an instrument panel rather than a
generic SaaS product. Amber is the highest-luminance hue in the palette, so it
cannot carry legible foreground text on a light background: `amber-500` on white
is roughly 2:1, and it only reaches WCAG AA for body text around `amber-800`, by
which point it reads brown rather than amber. As a fill behind near-black text it
is roughly 10.6:1. We therefore constrain the Accent to backgrounds — `--primary`
is only ever a fill, paired with a near-black `--primary-foreground`, and
emphasis or link text uses high-contrast neutral instead.

## Consequences

- Never write `text-primary`, `text-amber-*`, or otherwise set the Accent as a
  text colour. Primary buttons, active navigation and tag chips, and the Admin
  badge are amber blocks with dark text.
- Focus rings may be amber (`--ring`), since a ring is not text and is exempt
  from the text contrast requirement.
- The Accent carries identity, not state. Amber therefore does not mean
  "warning": Destructive styling covers irreversible actions, and there is no
  warning hue. The unused `warning` toast icon was removed rather than themed.
- Because a Workspace may supply its own Branding logo, the Accent is applied to
  controls rather than to the mark, so it never clashes with an unknown image.
