# Agent and contributor guide

This document is for **humans and coding agents** working on `@vitrion/expo-state-mcp`. Follow it so new work stays consistent with layout, quality checks, and release automation. Detailed npm and MCP client notes live in [README.md](./README.md) and [DEVELOPMENT.md](./DEVELOPMENT.md).

## What this package is

- **One npm package**, two compile targets:
  - **`src/app/`** — in-app **HTTP bridge** (bundled by Metro into the Expo app). Talks to `expo-sqlite` and Zustand over TCP (`react-native-tcp-socket`).
  - **`src/cli/`** — **MCP stdio server** (Node) that proxies to the bridge via HTTP (`bridgeClient.ts`).
- **`exports`** in `package.json`: Metro resolves the **`react-native`** entry (bridge); Node resolves the default entry (CLI).

```
MCP client / CLI  ←stdio→  MCP server  ←HTTP→  bridge (inside running Expo app)
```

## Before you change code

1. **Read the relevant area:** bridge routing in [`src/app/server.ts`](src/app/server.ts), handlers under [`src/app/handlers/`](src/app/handlers/), MCP tools in [`src/cli/mcp.ts`](src/cli/mcp.ts).
2. **Keep scope tight:** dev-only tooling; no unrelated refactors or new docs unless the task requires them.
3. **Match existing style:** TypeScript strict, same import patterns (`*.js` suffix in CLI imports where already used), Zod schemas for MCP tool inputs.

## How to add a feature (end-to-end)

Most features touch **three layers**: bridge HTTP API → optional handler module → MCP tool(s).

### 1. Bridge (React Native)

- Add or extend a **handler** under [`src/app/handlers/`](src/app/handlers/) (e.g. SQLite / Zustand). Return the existing `{ ok: true, data }` / `{ ok: false, error }` shape from [`src/app/types.ts`](src/app/types.ts). On success, **`dispatch`** wraps responses with **`device`** via `wrapOk` — do not add `device` inside individual handlers.
- **Register the route** in [`src/app/server.ts`](src/app/server.ts) inside `dispatch`: parse method/path, read query or JSON body, call the handler, return `wrapOk(ctx, result)` for success paths (or `json(...)` for errors / non-JSON).
- **Security:** bridge is dev-only (`setupBridge` is a no-op when `__DEV__` is false). Still treat inputs carefully: avoid prototype pollution on dot-paths (see [`src/app/util/path.ts`](src/app/util/path.ts)), respect optional Bearer token auth, and keep request bodies bounded (see [`src/app/util/http.ts`](src/app/util/http.ts)).

### 2. MCP tools (Node CLI)

- In [`src/cli/mcp.ts`](src/cli/mcp.ts), call `bridgeGet` / `bridgePost` with the same paths the bridge exposes (pass the resolved bridge **base URL** from [`src/cli/devices.ts`](src/cli/devices.ts) when multi-bridge).
- Define **`inputSchema`** with **Zod**; use `unwrapApi` + **`okWithDevice`** / `errText` for tools that return bridge data (shape `{ device, data }`). Use [`src/cli/devices.ts`](src/cli/devices.ts) for `resolveDevice` / `list_devices`.
- Bump the **MCP server `version`** in `McpServer({ ... })` when you ship a meaningful CLI/tool change (keep aligned with `package.json` when practical).

### 3. Tests

- Add **Vitest** tests under [`tests/`](tests/) (`*.test.ts`). Prefer testing **pure helpers** (e.g. HTTP parsing, path utilities) with clear cases. Run **`yarn test`** before pushing.
- If you add logic that is hard to unit-test without RN, keep the handler small and test the extracted pure functions.

### 4. Documentation

- Update **[README.md](./README.md)** if user-facing behavior, new env vars, or new MCP tool names change.
- **Changelog:** do not hand-edit for releases; **release-please** updates [`CHANGELOG.md`](CHANGELOG.md) from commits (see below).

## Quality gate (run locally)

Same order as CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
yarn verify
```

This runs **`yarn typecheck`** → **`yarn lint`** → **`yarn test`** → **`yarn build`**. Use **`yarn audit`** periodically for dependency advisories.

## Git and CI

- Use **[Conventional Commits](https://www.conventionalcommits.org/)** on `main`: `feat:`, `fix:`, `chore:`, `docs:`, etc. This drives versioning and changelog generation.
- **Pull requests** to `main` should pass CI (typecheck, lint, test, build).

## Release and publish flow (maintainers)

This repo uses **release-please** + **npm Trusted Publishing (OIDC)**. Full setup and troubleshooting (including **`RELEASE_PLEASE_TOKEN`** when GitHub blocks workflow PRs) are documented in [DEVELOPMENT.md](./DEVELOPMENT.md).

Short version:

1. Land conventional commits on `main`.
2. **release-please** opens a **Release PR** (version bump, manifest, changelog).
3. **Merge the Release PR** when you want to release; tagging triggers **`npm publish --provenance`** in GitHub Actions.

**Trusted Publishing** needs recent **Node** and **npm** versions; if CI shows a bogus **404** on publish, see **Troubleshooting** in [DEVELOPMENT.md](./DEVELOPMENT.md) (common mistake: `setup-node` **`registry-url`** breaks OIDC). To **retry npm only** after a failed publish, configure **`NPM_PUBLISH_TOKEN`** and use **Actions → release → Run workflow** (tag defaults to `expo-state-mcp-v1.x.x` style from release-please); see [DEVELOPMENT.md](./DEVELOPMENT.md).

Do **not** rely on manual version bumps in day-to-day work; let the Release PR do it unless there is an exceptional hotfix process.

## File map (quick reference)

| Path | Role |
|------|------|
| [`src/app/index.ts`](src/app/index.ts) | `setupBridge` / `teardownBridge` |
| [`src/app/server.ts`](src/app/server.ts) | HTTP dispatch, auth, TCP server |
| [`src/app/handlers/`](src/app/handlers/) | SQLite / Zustand / health handlers |
| [`src/app/util/`](src/app/util/) | HTTP parsing, paths, IP helper, device identity |
| [`src/cli/mcp.ts`](src/cli/mcp.ts) | MCP tools registration |
| [`src/cli/bridgeClient.ts`](src/cli/bridgeClient.ts) | HTTP client to the bridge |
| [`src/cli/devices.ts`](src/cli/devices.ts) | Multi-bridge env parsing, `/device` probe, `resolveDevice` |
| [`tests/`](tests/) | Vitest tests |
| [`eslint.config.mjs`](eslint.config.mjs) | ESLint flat config |
| [`vitest.config.ts`](vitest.config.ts) | Vitest config |
| [`release-please-config.json`](release-please-config.json) | release-please manifest config |
| [`.release-please-manifest.json`](.release-please-manifest.json) | Current released version anchor |

## npm package contents

Published tarball includes **`dist/`**, **README**, **LICENSE** — not raw `src/`. Always run **`yarn build`** before publishing; **`prepublishOnly`** runs the build for local `npm publish` if used.
