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

void setupBridge({
  port: 9778,
  appName: "my-app",
  db,
  stores: { "zustand.auth": useAuthStore },
});
```

`setupBridge` returns a `Promise` that resolves once the bridge is listening (it collects device metadata first). You can `void setupBridge(...)` at module scope or `await setupBridge(...)` during app init. Call once early (e.g. next to Reactotron). No-ops when `__DEV__` is false.

**Port fallback:** when `port` is taken (for example a second app on another iOS simulator, which shares the Mac's loopback), the bridge tries the next port, up to `portRange` ports (default 20, so 9778-9797). The console logs the port it bound. Set `portRange: 1` to disable the fallback. The CLI scans the same range by default, see [Several apps at once](#several-apps-at-once).

**Android Emulator:** from the host machine, run `adb forward tcp:9778 tcp:9778` so `http://127.0.0.1:9778` on the host reaches the bridge inside the emulator (`forward` goes host to device; `reverse` is the other direction, used for Metro). With several emulators or an iOS simulator running too, see [Android](#android).

Optional Bearer token: app `token` + env `EXPO_STATE_MCP_TOKEN` on the machine running the MCP CLI.

#### `bindAllInterfaces` (optional)

By default the bridge listens on **loopback** (`127.0.0.1`). That is enough in many setups, including a lot of **iOS Simulator + Mac** flows, so you do not need to set anything extra to start.

**Turn it on when the MCP CLI (or `curl` on your Mac) cannot reach the app** — errors like “bridge unreachable” or `127.0.0.1:9778` connection refused while the app is running:

- **iOS Simulator:** the simulator and the Mac each have their own loopback; on some OS / simulator versions, only the simulator can see a `127.0.0.1` listener. If the **host** cannot connect, pass `bindAllInterfaces: true` (listens on `0.0.0.0`) so traffic from your Mac reaches the bridge. Example:

  ```tsx
  void setupBridge({
    // …
    bindAllInterfaces: true,
  });
  ```

  To limit binding to simulator only (not physical devices), you can use `Platform.OS === "ios" && !Device.isDevice` from `react-native` / `expo-device`.

- **Physical device:** use `bindAllInterfaces: true` (or bind to your LAN as needed), read the LAN IP from console logs if provided, and set **`EXPO_STATE_MCP_BRIDGE_URL`** on your machine to `http://<device-ip>:9778`.

If everything already works without it, leave it unset.

### 3. Wire your MCP client

Same stdio server everywhere: **`npx -y @vitrion/expo-state-mcp`**. No env is needed for simulators and emulators: the CLI scans `127.0.0.1:9778-9797` for bridges. Set **`EXPO_STATE_MCP_BRIDGE_URL`** only for a bridge outside that range (e.g. a physical device on the LAN). All variables: [CLI environment](#cli-environment).

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
      "args": ["-y", "@vitrion/expo-state-mcp"]
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
      "args": ["-y", "@vitrion/expo-state-mcp"]
    }
  }
}
```

</details>

<details>
<summary>Claude Code — full details</summary>

From a terminal. Flags go **before** the server name; **`--`** separates Claude’s options from the command that starts the MCP server.

```bash
claude mcp add --scope user expo-state-mcp -- npx -y @vitrion/expo-state-mcp
```

See [Claude Code MCP docs](https://docs.claude.com/en/docs/claude-code/mcp).

</details>

<details>
<summary>OpenAI Codex (CLI + IDE) — full details</summary>

[OpenAI Codex](https://developers.openai.com/codex/mcp) reads MCP from **`~/.codex/config.toml`** or project **`.codex/config.toml`** (trusted projects). **CLI and IDE extension share one file** — configure once, use in both.

**Terminal:**

```bash
codex mcp add expo-state-mcp -- npx -y @vitrion/expo-state-mcp
```

**Or edit `config.toml`** (in the IDE: **MCP settings → Open config.toml** from the gear menu). Env block matches [Codex docs](https://developers.openai.com/codex/mcp) (`[mcp_servers.<name>.env]`):

```toml
[mcp_servers.expo-state-mcp]
command = "npx"
args = ["-y", "@vitrion/expo-state-mcp"]

# Optional, e.g. to pin one app when several run:
# [mcp_servers.expo-state-mcp.env]
# EXPO_STATE_MCP_METRO_PORT = "8081"
```

More options: `codex mcp` help, timeouts, streamable HTTP servers — [Model Context Protocol – Codex](https://developers.openai.com/codex/mcp).

</details>

<details>
<summary>Local clone of this repo (<code>node …/dist/cli/cli.js</code> instead of <code>npx</code>)</summary>

Use `command`: `node` and point `args` at `../expo-state-mcp/dist/cli/cli.js` (after `yarn build` in the clone). Copy-paste JSON and TOML per client in [DEVELOPMENT.md](./DEVELOPMENT.md).

</details>

### Connectivity

| Target | How the CLI finds it | Notes |
|--------|----------------------|--------|
| iOS Simulator | Port scan of `127.0.0.1:9778-9797` | Each app on another simulator takes the next free port. Add `bindAllInterfaces` only if the Mac cannot reach the bridge (see above). |
| Android Emulator | Port scan, after `adb forward` | See [Android](#android). |
| Physical device | `EXPO_STATE_MCP_BRIDGE_URL=http://<lan-ip>:9778` | Use `bindAllInterfaces` / LAN binding; align the URL with the console log. |

### Devices (MCP)

Each successful bridge response includes a **`device`** object, and the MCP tools return **`{ "device": { … }, "data": … }`** so you always know which app answered. `device` contains:

| Field | Example | Notes |
|-------|---------|-------|
| `id` | `ios-26-4-iphone-air-sim-3f2a` | New random suffix on every JS reload, so do not pin on it long-term. |
| `deviceName` | `iPhone Air` | Simulator / device name (`expo-constants`). |
| `platform`, `osVersion`, `model`, `brand`, `isPhysicalDevice` | `ios`, `26.4` | `expo-device` fields when installed. |
| `appName`, `applicationId` | `my-app`, `com.example.app` | `applicationId` needs `expo-application`. |
| `metro` | `{ "url": "http://127.0.0.1:8095", "host": "127.0.0.1", "port": 8095 }` | Metro the bundle was loaded from; `null` for an embedded bundle. Stable across reloads. |
| `bridge` | `{ "host": "127.0.0.1", "port": 9779 }` | Port the bridge bound **on the device**. |
| `url` | `http://127.0.0.1:9779` | Address the CLI reached it on (differs from `bridge.port` with `adb forward`). |
| `startedAt`, `lanIp` | | |

- **`list_devices`** returns `{ default, defaultReason, devices, unreachable }`. Each device also carries `projectRoot` (from Metro's `/status`, so you can tell checkouts and worktrees apart) and `selectors`, the strings you can pass as `device`. `unreachable` lists configured URLs that did not answer and bridges that refused (e.g. token mismatch). Results are cached for a few seconds; `refresh: true` re-probes.
- **Per-tool `device`**: every SQLite/Zustand tool accepts an optional selector:

| Selector | Matches |
|----------|---------|
| `metro:8095` | The app loaded from Metro on port 8095. Best choice: you know which Metro you started. |
| `bridge:9779` (or `port:9779`) | The bridge reached on host port 9779. |
| `name:iPhone Air` | Device name or model, case-insensitive. |
| `project:/abs/path` | Metro project root (exact path, symlinks resolved). |
| `<id>` / `<alias>` / `iPhone Air` | Device id, alias from `EXPO_STATE_MCP_BRIDGES`, or bare device name. |

A selector that matches several apps is an error that lists them. When a selector finds nothing, the CLI re-probes once (the app may have reloaded onto another port).

### Several apps at once

The common case: several agents or worktrees each run the app on their own simulator with their own Metro port.

1. Every app's bridge binds the first free port from 9778 (fallback, see above).
2. The CLI scans `EXPO_STATE_MCP_PORT_RANGE` (default `9778-9797`) on `127.0.0.1` in parallel and lists every live bridge.
3. **The CLI never guesses between apps.** Without a `device` argument it uses, in order:
   1. `EXPO_STATE_MCP_DEFAULT_DEVICE` (any selector, e.g. `metro:8081`)
   2. `EXPO_STATE_MCP_METRO_PORT` (shorthand for `metro:<port>`)
   3. the only live bridge, when there is exactly one
   4. otherwise an error listing each app with its selectors, e.g. `- ios-26-4-iphone-air-sim-3f2a: iPhone Air (ios 26.4) [my-app] metro:8095 bridge:9779 project:/path/to/worktree`

So an agent that started Metro on 8095 passes `device: "metro:8095"`; a project config that always uses one Metro can set `EXPO_STATE_MCP_METRO_PORT`.

**Explicit URLs** still work:

- `EXPO_STATE_MCP_BRIDGE_URL`: probed in addition to the scan (useful for a physical device on the LAN).
- `EXPO_STATE_MCP_BRIDGES`: JSON array or comma-separated list; when set, **only** these are probed unless `EXPO_STATE_MCP_PORT_RANGE` is set too.
  - JSON: `[{"url":"http://127.0.0.1:9778"},{"url":"http://192.168.1.20:9778","alias":"pixel"}]`
  - Shorthand: `http://127.0.0.1:9778,http://192.168.1.20:9778`
- `EXPO_STATE_MCP_PORT_RANGE=off` turns scanning off (the pre-1.3 behavior: only `BRIDGE_URL`, default `http://127.0.0.1:9778`).

Upgrade note: with scanning on, a setup that used to see one bridge (e.g. a LAN device in `BRIDGE_URL`) now also sees simulators on the Mac and asks for a selector. Set `EXPO_STATE_MCP_METRO_PORT` / `EXPO_STATE_MCP_DEFAULT_DEVICE`, or `EXPO_STATE_MCP_PORT_RANGE=off`.

If the app bridge predates `GET /device`, the CLI still probes **`/health`** and assigns a stable **`legacy-…`** device id so `list_devices` and routing keep working after a CLI-only upgrade. Older bridges have no `metro` field, so `metro:` selectors need the app on 1.3+.

### Android

Each emulator has its own loopback, so the app inside always binds 9778 there; the collision moves to the host side. Forward a free host port in the scan range to each emulator's 9778 (`adb forward LOCAL REMOTE`: host port first, device port second):

```bash
adb -s emulator-5554 forward tcp:9790 tcp:9778
adb -s emulator-5556 forward tcp:9791 tcp:9778
```

Host 9778 is often held by an iOS simulator app (simulators share the Mac's loopback), so start the Android ones higher (e.g. 9790). Metro still uses `adb -s <serial> reverse tcp:<metro> tcp:<metro>` (device to host). `bridge:9790` then picks that emulator; `metro:<port>` works too because the CLI maps `10.0.2.2` / `localhost` to the Mac's loopback.

## MCP tools

`list_devices`, `sqlite_list_tables`, `sqlite_describe_table`, `sqlite_query`, `sqlite_explain`, `zustand_list_stores`, `zustand_get`, `zustand_set`, `zustand_call`

## Repo layout

- `src/app/` — bridge (bundled by Metro)
- `src/cli/` — MCP stdio server

Contributor / agent process: [AGENTS.md](./AGENTS.md). Maintainer workflow: [DEVELOPMENT.md](./DEVELOPMENT.md).

### CLI environment

| Variable | Default |
|----------|---------|
| `EXPO_STATE_MCP_PORT_RANGE` | `9778-9797` (also `9778`, `9778-9790,9800`; `off` disables scanning) |
| `EXPO_STATE_MCP_BRIDGE_URL` | _(empty)_ Extra bridge to probe next to the scan. With scanning off: `http://127.0.0.1:9778` |
| `EXPO_STATE_MCP_BRIDGES` | _(empty)_ Explicit list; disables the scan unless `EXPO_STATE_MCP_PORT_RANGE` is set |
| `EXPO_STATE_MCP_DEFAULT_DEVICE` | _(empty)_ Selector used when a tool omits `device` |
| `EXPO_STATE_MCP_METRO_PORT` | _(empty)_ Same as `EXPO_STATE_MCP_DEFAULT_DEVICE=metro:<port>` (lower priority) |
| `EXPO_STATE_MCP_TOKEN` | _(empty)_ |

## Security

Dev-only: loopback by default, optional Bearer token (compared in constant time), request bodies capped at 5 MiB, `setupBridge` does nothing in production builds. Use a shared secret when binding beyond loopback.

## License

MIT — see [LICENSE](./LICENSE).
