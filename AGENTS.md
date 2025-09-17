# Repository Guidelines

## Project Structure & Module Organization
- `app/` holds the Next.js UI and route handlers; keep components under `app/(ui)` and APIs in `app/api`.
- Shared domain logic lives in `lib/` (criteria DSL, BibTeX parsers) so it can be reused by UI and background tasks.
- Version rule templates in `rules/`; sync test fixtures from the same YAML files.
- Mirror source layout in `tests/`, and migrate growing design docs into `docs/` instead of the repo root.

## Build, Test, and Development Commands
- `npm install` with Node 20; commit lockfile updates only when dependency changes are deliberate.
- `npm run dev` launches the local UI plus Edge-ready APIs.
- `npm run lint` runs ESLint + Prettier; resolve every warning or annotate why it is safe.
- `npm run test` executes Vitest suites; add `--runInBand` when isolating flaky specs.
- `npm run build` and `npm run test:e2e` (Playwright) gate merges—run both before tagging a release.

## Coding Style & Naming Conventions
- TypeScript in strict mode, 2-space indentation, trailing commas on multiline literals.
- Components use `PascalCase`, hooks use `useCamelCase`, and imperative utilities prefer verb-first names.
- Keep side effects in dedicated `services/` modules; presentational components stay pure.
- Run `npm run lint -- --fix` and rely on the shared Prettier config before every commit.

## Testing Guidelines
- Place unit specs in `tests/**/*.spec.ts`; snapshot only stable serialized outputs.
- Mock LLM adapters and any network I/O, but prefer real `.bib` fixtures for parsing coverage.
- Target ≥90% coverage for `lib/` and decision logic; verify with `npm run coverage`.
- Use Playwright smoke flows to cover import → triage → export before each release candidate.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `chore:`); subjects stay ≤72 characters with context in the body.
- Squash WIP commits; PR descriptions must capture scope, validation steps, and linked issues or PRD sections.
- Attach screenshots or CLI logs for UX-visible changes.
- Request a second reviewer when touching criteria evaluation or any security-sensitive area.

## Security & Configuration Tips
- Keep secrets such as `OPENROUTER_API_KEY` in `.env.local`; never commit `.env*` files.
- Strip or hash personally identifiable data in telemetry and request logs.
- Document required configuration in `docs/configuration.md` and update it alongside deployments.
