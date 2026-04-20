# expo-state-mcp

[![npm](https://img.shields.io/npm/v/%40vitrion%2Fexpo-state-mcp?logo=npm&label=npm)](https://www.npmjs.com/package/@vitrion/expo-state-mcp)
[![npm downloads](https://img.shields.io/npm/dm/%40vitrion%2Fexpo-state-mcp?logo=npm&label=downloads)](https://www.npmjs.com/package/@vitrion/expo-state-mcp)
[![CI](https://github.com/vitrionbv/expo-state-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/vitrionbv/expo-state-mcp/actions/workflows/ci.yml)
[![Release](https://github.com/vitrionbv/expo-state-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/vitrionbv/expo-state-mcp/actions/workflows/release.yml)
[![Provenance](https://img.shields.io/badge/npm-provenance-success?logo=npm)](https://docs.npmjs.com/generating-provenance-statements)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> Inspect and mutate a running **Expo** app's live **`expo-sqlite`** database and **`zustand`** stores from any **MCP** client (Cursor, Claude, OpenAI Codex, …) — dev-only, zero production footprint.

**One package (`@vitrion/expo-state-mcp`):** Metro resolves the **`react-native`** export (TCP bridge in the app); Node runs the **`expo-state-mcp`** CLI for your MCP host.

```
MCP client  ←stdio→  CLI  ←HTTP→  bridge (in the RN app)
```

## Expo app setup

### 1. Install

```bash
yarn add -D @vitrion/expo-state-mcp
```

`react-native-tcp-socket` is included as a dependency of this package. Rebuild the native app once (`expo run:ios` / `expo run:android`) so autolinking picks it up.

<details>
<summary>Local clone instead of npm (<code>file:</code> install)</summary>

For a **local checkout** next to your app:

```bash
yarn add -D file:../expo-state-mcp
```

Run `yarn build` in this repo first (`dist/` is not committed). Ensure Metro resolves `package.json` `exports` (Expo SDK 54+ / Metro 0.82+ usually does; otherwise `resolver.unstable_enablePackageExports = true` in `metro.config.js`).

</details>

### 2. Wire the bridge (`__DEV__`)

```tsx
import { setupBridge } from "@vitrion/expo-state-mcp";
import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("my.db");
import { useAuthStore } from "./stores/auth";

setupBridge({
  port: 9778,
  appName: "my-app",
  db,
  stores: { "zustand.auth": useAuthStore },
});
```

Call once early (e.g. next to Reactotron). No-ops when `__DEV__` is false.

**Android Emulator:** from the host machine, run `adb reverse tcp:9778 tcp:9778` so `http://127.0.0.1:9778` reaches the emulated app.

Optional Bearer token: app `token` + env `EXPO_STATE_MCP_TOKEN` on the machine running the MCP CLI.

#### `bindAllInterfaces` (optional)

By default the bridge listens on **loopback** (`127.0.0.1`). That is enough in many setups, including a lot of **iOS Simulator + Mac** flows, so you do not need to set anything extra to start.

**Turn it on when the MCP CLI (or `curl` on your Mac) cannot reach the app** — errors like “bridge unreachable” or `127.0.0.1:9778` connection refused while the app is running:

- **iOS Simulator:** the simulator and the Mac each have their own loopback; on some OS / simulator versions, only the simulator can see a `127.0.0.1` listener. If the **host** cannot connect, pass `bindAllInterfaces: true` (listens on `0.0.0.0`) so traffic from your Mac reaches the bridge. Example:

  ```tsx
  setupBridge({
    // …
    bindAllInterfaces: true,
  });
  ```

  To limit binding to simulator only (not physical devices), you can use `Platform.OS === "ios" && !Device.isDevice` from `react-native` / `expo-device`.

- **Physical device:** use `bindAllInterfaces: true` (or bind to your LAN as needed), read the LAN IP from console logs if provided, and set **`EXPO_STATE_MCP_BRIDGE_URL`** on your machine to `http://<device-ip>:9778`.

If everything already works without it, leave it unset.

### 3. Wire your MCP client

Same stdio server everywhere: **`npx -y @vitrion/expo-state-mcp`**. Optional env **`EXPO_STATE_MCP_BRIDGE_URL`** (default `http://127.0.0.1:9778`).

Pick your client — then open the matching **full details** block for copy-paste config.

| Client | Where you wire it |
|--------|-------------------|
| **Cursor** | Project [`.cursor/mcp.json`](https://docs.cursor.com/context/model-context-protocol) → `mcpServers` |
| **Claude Desktop** | `claude_desktop_config.json` (paths below) → same `mcpServers` JSON shape |
| **Claude Code** | `claude mcp add …` ([MCP docs](https://docs.claude.com/en/docs/claude-code/mcp)) |
| **OpenAI Codex** (CLI + IDE) | Shared `~/.codex/config.toml` or `codex mcp add …` ([Codex MCP](https://developers.openai.com/codex/mcp)); IDE: **gear → MCP settings → Open config.toml** |

<details>
<summary>Cursor — full details</summary>

Create [`.cursor/mcp.json`](https://docs.cursor.com/context/model-context-protocol):

```json
{
  "mcpServers": {
    "expo-state-mcp": {
      "command": "npx",
      "args": ["-y", "@vitrion/expo-state-mcp"],
      "env": {
        "EXPO_STATE_MCP_BRIDGE_URL": "http://127.0.0.1:9778"
      }
    }
  }
}
```

</details>

<details>
<summary>Claude Desktop — full details</summary>

Edit **`claude_desktop_config.json`**:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Same `mcpServers` shape as Cursor:

```json
{
  "mcpServers": {
    "expo-state-mcp": {
      "command": "npx",
      "args": ["-y", "@vitrion/expo-state-mcp"],
      "env": {
        "EXPO_STATE_MCP_BRIDGE_URL": "http://127.0.0.1:9778"
      }
    }
  }
}
```

</details>

<details>
<summary>Claude Code — full details</summary>

From a terminal. Flags go **before** the server name; **`--`** separates Claude’s options from the command that starts the MCP server.

```bash
claude mcp add --scope user --env EXPO_STATE_MCP_BRIDGE_URL=http://127.0.0.1:9778 expo-state-mcp -- npx -y @vitrion/expo-state-mcp
```

See [Claude Code MCP docs](https://docs.claude.com/en/docs/claude-code/mcp).

</details>

<details>
<summary>OpenAI Codex (CLI + IDE) — full details</summary>

[OpenAI Codex](https://developers.openai.com/codex/mcp) reads MCP from **`~/.codex/config.toml`** or project **`.codex/config.toml`** (trusted projects). **CLI and IDE extension share one file** — configure once, use in both.

**Terminal:**

```bash
codex mcp add expo-state-mcp --env EXPO_STATE_MCP_BRIDGE_URL=http://127.0.0.1:9778 -- npx -y @vitrion/expo-state-mcp
```

**Or edit `config.toml`** (in the IDE: **MCP settings → Open config.toml** from the gear menu). Env block matches [Codex docs](https://developers.openai.com/codex/mcp) (`[mcp_servers.<name>.env]`):

```toml
[mcp_servers.expo-state-mcp]
command = "npx"
args = ["-y", "@vitrion/expo-state-mcp"]

[mcp_servers.expo-state-mcp.env]
EXPO_STATE_MCP_BRIDGE_URL = "http://127.0.0.1:9778"
```

More options: `codex mcp` help, timeouts, streamable HTTP servers — [Model Context Protocol – Codex](https://developers.openai.com/codex/mcp).

</details>

<details>
<summary>Local clone of this repo (<code>node …/dist/cli/cli.js</code> instead of <code>npx</code>)</summary>

Use `command`: `node` and point `args` at `../expo-state-mcp/dist/cli/cli.js` (after `yarn build` in the clone). Copy-paste JSON and TOML per client in [DEVELOPMENT.md](./DEVELOPMENT.md).

</details>

### Connectivity

| Target | MCP URL on your machine | Notes |
|--------|-------------------------|--------|
| iOS Simulator | Usually `http://127.0.0.1:9778` | Add `bindAllInterfaces` only if the Mac cannot reach the bridge (see above). |
| Android Emulator | `http://127.0.0.1:9778` after `adb reverse tcp:9778 tcp:9778` | Reverse forwards host port to the emulator. |
| Physical device | `http://<lan-ip>:9778` | Use `bindAllInterfaces` / LAN binding; align `EXPO_STATE_MCP_BRIDGE_URL` with logs. |

## MCP tools

`sqlite_list_tables`, `sqlite_describe_table`, `sqlite_query`, `sqlite_explain`, `zustand_list_stores`, `zustand_get`, `zustand_set`, `zustand_call`

## Repo layout

- `src/app/` — bridge (bundled by Metro)
- `src/cli/` — MCP stdio server

Contributor / agent process: [AGENTS.md](./AGENTS.md). Maintainer workflow: [DEVELOPMENT.md](./DEVELOPMENT.md).

### CLI environment

| Variable | Default |
|----------|---------|
| `EXPO_STATE_MCP_BRIDGE_URL` | `http://127.0.0.1:9778` |
| `EXPO_STATE_MCP_TOKEN` | _(empty)_ |

## Security

Dev-only: loopback by default, optional Bearer token (compared in constant time), request bodies capped at 5 MiB, `setupBridge` does nothing in production builds. Use a shared secret when binding beyond loopback.

## License

MIT — see [LICENSE](./LICENSE).
