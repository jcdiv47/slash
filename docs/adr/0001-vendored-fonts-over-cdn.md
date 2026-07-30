# Vendored fonts, never a font CDN

Slash's frontend is compiled into the server binary with `//go:embed dist`
(`server/route/frontend/frontend.go`), and instances are typically self-hosted on
private or air-gapped networks. Loading Inter and JetBrains Mono from Google
Fonts would therefore make every page view of a self-hosted privacy tool issue a
request to a third party, leaking each Member's IP address, and would leave the
UI rendering in a fallback face wherever there is no egress. We install the faces
as `@fontsource-variable/*` packages and `@import` them from `src/css/index.css`,
so Vite emits the `.woff2` files into `dist/assets/` and they ship inside the
binary.

## Consequences

- The binary grows by ~310KB of font data. A browser only downloads the subsets
  it needs — ~89KB for a Latin-script Member — because Fontsource splits the
  faces by `unicode-range`.
- All subsets are bundled rather than Latin alone, so the Cyrillic locale renders
  in Inter rather than falling back to a system face.
- Do not "simplify" the `@import`s in `src/css/index.css` into a `<link>` tag in
  `index.html`. That reintroduces the egress dependency this decision exists to
  remove.
