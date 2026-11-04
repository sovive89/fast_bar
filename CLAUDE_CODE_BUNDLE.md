# Claude Code bundle

This repository includes a root `CLAUDE.md` for Claude Code. It is the operational
handoff: architecture, verified current state, safeguards, product decisions and the
implementation queue.

## Start here

```powershell
pnpm install
pnpm dev
git status --short
```

Then read [`CLAUDE.md`](./CLAUDE.md) in full before making changes.

## Safe handoff prompt

> Read `CLAUDE.md` completely. Work in the existing FastBar repository without
> overwriting uncommitted user changes. Begin with the opening-operation stock
> reconciliation gate, including audited password-only skip. Inspect the current data
> model first, add a reversible Supabase migration only when persistence is required,
> keep the flow mobile-first, then run lint/build and report verified results only.

## Included scope

- Product decisions consolidated from the FastBar/Pop9 Bar workshops.
- Confirmed repository state and current incomplete work.
- Data model guardrails and tenant/domain constraints.
- Sequenced roadmap and acceptance criteria for the immediate first task.

## Explicit exclusions

- `.env` and credentials.
- Any claim that fiscal, terminal, notification or deployment integrations are live.
- Unverified PR/deploy state.
