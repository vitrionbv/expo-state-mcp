# expo-state-mcp

Dev-only toolkit: a running **Expo** app’s **`expo-sqlite`** DB and **`zustand`** stores exposed over HTTP, plus an **MCP** (stdio) server so **Cursor** can inspect and change live state.

**One package (`@vitrion/expo-state-mcp`):** Metro resolves the **`react-native`** export (TCP bridge in the app); Node/Cursor runs the **`expo-state-mcp`** CLI.

```
Cursor  ←stdio→  CLI  ←HTTP→  bridge (in the RN app)
```

## Expo app setup

### 1. Install

```bash
yarn add -D @vitrion/expo-state-mcp
```

`react-native-tcp-socket` is included as a dependency of this package. Rebuild the native app once (`expo run:ios` / `expo run:android`) so autolinking picks it up.

For a **local checkout** next to your app:

```bash
yarn add -D file:../expo-state-mcp
```

Run `yarn build` in this repo first (`dist/` is not committed). Ensure Metro resolves `package.json` `exports` (Expo SDK 54+ / Metro 0.82+ usually does; otherwise `resolver.unstable_enablePackageExports = true` in `metro.config.js`).

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

### 3. Cursor (`.cursor/mcp.json`)

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

For development against a **local git clone** of this repo, point `args` at `../expo-state-mcp/dist/cli/cli.js` with `command`: `node` (see [DEVELOPMENT.md](./DEVELOPMENT.md)).

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

Maintainer workflow: [DEVELOPMENT.md](./DEVELOPMENT.md).

### CLI environment

| Variable | Default |
|----------|---------|
| `EXPO_STATE_MCP_BRIDGE_URL` | `http://127.0.0.1:9778` |
| `EXPO_STATE_MCP_TOKEN` | _(empty)_ |

## Security

Dev-only: loopback by default, optional Bearer token (compared in constant time), request bodies capped at 5 MiB, `setupBridge` does nothing in production builds. Use a shared secret when binding beyond loopback.

## License

MIT — see [LICENSE](./LICENSE).
