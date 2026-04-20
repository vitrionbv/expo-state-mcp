# Development

## Build

```bash
yarn install
yarn build
```

Outputs **`dist/app/`** (React Native bridge) and **`dist/cli/`** (Node MCP + `expo-state-mcp` bin). `dist/` is gitignored — run `yarn build` before publishing or when using `file:` from a host app.

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

## Consume from npm

```bash
yarn add -D @vitrion/expo-state-mcp
```

## Local `file:` install

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

## Cursor using a local CLI build

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

Published installs typically use `npx -y @vitrion/expo-state-mcp` — see the root [README](./README.md).

## Reachability troubleshooting

If **`curl http://127.0.0.1:9778/health`** from your dev machine fails while the app is open:

- **Android emulator:** run `adb reverse tcp:9778 tcp:9778`.
- **iOS Simulator:** try `setupBridge({ ..., bindAllInterfaces: true })` — see README section **bindAllInterfaces (optional)**.
- **Physical device:** use LAN URL + `EXPO_STATE_MCP_BRIDGE_URL` as in the README.
