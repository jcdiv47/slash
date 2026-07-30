# Domain Docs

How engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `CONTEXT-MAP.md`, if present, and each context relevant to the topic.
- Relevant ADRs under `docs/adr/`.

If these files don't exist, proceed silently. The domain-modeling skill creates them lazily when terminology or decisions are resolved.

## File structure

This repository uses a single-context layout:

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

Use terms as defined in `CONTEXT.md`. Avoid synonyms the glossary explicitly rejects. If a needed concept is missing, reconsider the terminology or note the gap for domain modeling.

## Flag ADR conflicts

If proposed work contradicts an ADR, surface the conflict explicitly rather than silently overriding the decision.
