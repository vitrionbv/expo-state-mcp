# Development

For **how we add features, run checks, and ship releases** (including agents), see [AGENTS.md](./AGENTS.md).

## Build

```bash
yarn install
yarn build
```

Outputs **`dist/app/`** (React Native bridge) and **`dist/cli/`** (Node MCP + `expo-state-mcp` bin). `dist/` is gitignored — run `yarn build` before publishing or when using `file:` from a host app.

**Checks (same order as CI):** `yarn typecheck` → `yarn lint` → `yarn test` → `yarn build`, or **`yarn verify`** for all of the above. **`yarn audit`** checks dependency advisories.

## Releases and publishing (maintainers)

Package: **`@vitrion/expo-state-mcp`** on [npm](https://www.npmjs.com/package/@vitrion/expo-state-mcp).

### Automated (recommended)

1. **Commits on `main`** use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `feat!:` for breaking changes, etc.).
2. **[release-please](https://github.com/googleapis/release-please)** (workflow `.github/workflows/release.yml`) opens or updates a **Release PR** that bumps `package.json`, [`.release-please-manifest.json`](./.release-please-manifest.json), and prepends to [`CHANGELOG.md`](./CHANGELOG.md).
3. **Merge that Release PR** when you want to ship. On merge, release-please creates a **Git tag** and **GitHub Release**, then the **`publish` job** runs **`npm publish --provenance --access public`** using **npm Trusted Publishing (OIDC)** — no `NPM_TOKEN` secret.

**One-time setup**

- **npm:** Package → **Settings** → **Trusted Publishers** → add **GitHub Actions** for org `vitrionbv`, repo `expo-state-mcp`, workflow file **`release.yml`** (environment blank unless you add one).
- **GitHub (release-please Release PRs):** Either:
  - **Repository:** **Settings** → **Actions** → **General** → **Read and write** permissions, and enable **Allow GitHub Actions to create and approve pull requests**; or
  - **If that checkbox is greyed out:** your **organization** likely forbids it (only an **org owner** can change **Organization** → **Settings** → **Actions** → **General** → allow that option for this repo or org-wide). You do **not** need that checkbox if you use a PAT (next bullet).
  - **PAT fallback (works when the checkbox is greyed):** Create a [fine-grained personal access token](https://github.com/settings/tokens?type=beta) with access to **`vitrionbv/expo-state-mcp`**, permissions **Contents** and **Pull requests** (Read and write), and **Metadata** (read). Add it as repository secret **`RELEASE_PLEASE_TOKEN`**. The release workflow uses it for release-please only; **npm publish** still uses **OIDC** (Trusted Publishing), not this token.

### Manual publish (emergency / local)

If you must publish outside CI, OTP may still apply to your npm account:

```bash
yarn build
npm publish --access public --otp=<code>
```

`prepublishOnly` runs `npm run build` again as a safety net.

### Troubleshooting: `npm publish` E404 on `@scope/pkg` (CI / Trusted Publishing)

npm’s docs require **Node ≥ 22.14.0** and **npm CLI ≥ 11.5.1** for [Trusted Publishing](https://docs.npmjs.com/trusted-publishers). Older versions can fail with a **misleading `404 Not Found` on `PUT …/@scope%2fpackage`** even when provenance steps succeed — see [npm/cli#8976](https://github.com/npm/cli/issues/8976).

This repo pins **`.nvmrc`** to **Node 24**, which bundles **npm 11.5+**. Avoid `npm install -g npm` on GitHub Actions (it can break the runner’s npm).

**Do not** use `actions/setup-node`’s **`registry-url`** for the publish job: it sets **`NODE_AUTH_TOKEN`** to **`GITHUB_TOKEN`**, and npm then tries to publish to registry.npmjs.org with that token instead of **OIDC**, which yields a misleading **404**. The **release** workflow omits `registry-url` so `npm publish` uses Trusted Publishing. Re-run the failed workflow after pulling latest `main`.

Also verify on npmjs.com: **package → Settings → Trusted publishing** matches **workflow file `release.yml`**, GitHub org/repo, and that **`package.json` `repository.url`** matches this GitHub repo exactly.

**Re-publish after a failed `npm publish`:** Add repository secret **`NPM_PUBLISH_TOKEN`** — a [granular npm access token](https://docs.npmjs.com/creating-and-viewing-access-tokens) with **read and write** for **`@vitrion/expo-state-mcp`** (automation token is fine). Then GitHub → **Actions** → **release** → **Run workflow** → set the **tag** (e.g. `expo-state-mcp-v1.1.0`). The **`publish-retry`** job uses that token; **OIDC Trusted Publishing does not apply to `workflow_dispatch`**, so the token is required for manual retries. Normal releases on **`push`** still use OIDC without this secret.

## Consume from npm

```bash
yarn add -D @vitrion/expo-state-mcp
```

## Optional: local paths

<details>
<summary>Local <code>file:</code> install</summary>

```json
{
  "devDependencies": {
    "@vitrion/expo-state-mcp": "file:../expo-state-mcp"
  }
}
```

If TypeScript sees duplicate `expo-sqlite` types, pin in the host app:

```json
"resolutions": {
  "expo-sqlite": "~16.0.10",
  "zustand": "^5.0.2"
}
```

</details>

<details>
<summary>MCP: local <code>dist/cli/cli.js</code> (any client)</summary>

Point at the built **`dist/cli/cli.js`** with `command`: **`node`**. Replace the path with your checkout location.

**Cursor / Claude Desktop** (JSON `mcpServers`):

```json
{
  "mcpServers": {
    "expo-state-mcp": {
      "command": "node",
      "args": ["${workspaceFolder}/../expo-state-mcp/dist/cli/cli.js"],
      "env": {
        "EXPO_STATE_MCP_BRIDGE_URL": "http://127.0.0.1:9778"
      }
    }
  }
}
```

**OpenAI Codex** (CLI and IDE; `~/.codex/config.toml` or project `.codex/config.toml`):

```toml
[mcp_servers.expo-state-mcp]
command = "node"
args = ["/absolute/path/to/expo-state-mcp/dist/cli/cli.js"]

[mcp_servers.expo-state-mcp.env]
EXPO_STATE_MCP_BRIDGE_URL = "http://127.0.0.1:9778"
```

Or: `codex mcp add expo-state-mcp --env EXPO_STATE_MCP_BRIDGE_URL=http://127.0.0.1:9778 -- node /absolute/path/to/expo-state-mcp/dist/cli/cli.js`

**Several bridges:** add env **`EXPO_STATE_MCP_BRIDGES`** (JSON array or comma-separated URLs) and optional **`EXPO_STATE_MCP_DEFAULT_DEVICE`** — see [README](./README.md) § **Devices (MCP)**.

Published installs typically use `npx -y @vitrion/expo-state-mcp` — see the root [README](./README.md).

</details>

## Reachability troubleshooting

If **`curl http://127.0.0.1:9778/health`** from your dev machine fails while the app is open:

- **Android emulator:** run `adb reverse tcp:9778 tcp:9778`.
- **iOS Simulator:** try `setupBridge({ ..., bindAllInterfaces: true })` — see README section **bindAllInterfaces (optional)**.
- **Physical device:** use LAN URL + `EXPO_STATE_MCP_BRIDGE_URL` as in the README.
