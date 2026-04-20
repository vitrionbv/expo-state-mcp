# expo-state-mcp

Dev-only toolkit that exposes a running **Expo** app’s **`expo-sqlite`** DB and **`zustand`** stores over `localhost`, with an **MCP** (stdio) adapter so **Cursor** can query and mutate live state without opening the Drizzle Studio browser UI.

```
Cursor  ←stdio→  @expo-state-mcp/server  ←HTTP→  @expo-state-mcp/bridge (inside the RN app)
```

## Packages

| Package | Role |
|--------|------|
| `@expo-state-mcp/bridge` | Runs inside `__DEV__`; opens a TCP HTTP server (`127.0.0.1:9778` by default). Uses your `SQLiteDatabase` handle + named Zustand stores **you register**. |
| `@expo-state-mcp/server` | Node MCP server (`expo-state-mcp` CLI) that proxies tool calls to the bridge. Cursor spawns this via `.cursor/mcp.json`. |

## Expo app setup

### 1. Dependencies

From **npm** (recommended):

```bash
yarn add -D @expo-state-mcp/bridge @expo-state-mcp/server
```

`react-native-tcp-socket` is bundled as a dependency of `@expo-state-mcp/bridge` — you do **not** add it separately.

Rebuild native binaries once after installing (`expo run:ios` / `expo run:android`) so autolinking picks up the native module.

**Local monorepo** (path is an example — adjust to your layout):

```bash
yarn add -D \
  file:../expo-state-mcp/packages/bridge \
  file:../expo-state-mcp/packages/server
```

### 2. Wire the bridge (`__DEV__`)

```tsx
import { setupBridge } from "@expo-state-mcp/bridge";
import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("my.db");
import { useAuthStore } from "./stores/auth"; // …

setupBridge({
  port: 9778,
  appName: "my-app",
  db,
  stores: {
    "zustand.auth": useAuthStore,
  },
});
```

Call `setupBridge` once early (same place you configure Reactotron). It no-ops when `__DEV__` is false.

Optional shared secret:

- App: `token: process.env.EXPO_PUBLIC_EXPO_STATE_MCP_TOKEN`
- MCP host env: `EXPO_STATE_MCP_TOKEN`

### 3. Cursor MCP (`.cursor/mcp.json`)

Publish-style (uses npm package — no local `dist/` path):

```json
{
  "mcpServers": {
    "expo-state-mcp": {
      "command": "npx",
      "args": ["-y", "@expo-state-mcp/server"],
      "env": {
        "EXPO_STATE_MCP_BRIDGE_URL": "http://127.0.0.1:9778"
      }
    }
  }
}
```

Local dev alternative (run from built workspace):

```json
{
  "mcpServers": {
    "expo-state-mcp-local": {
      "command": "node",
      "args": ["../expo-state-mcp/packages/server/dist/cli.js"],
      "env": {
        "EXPO_STATE_MCP_BRIDGE_URL": "http://127.0.0.1:9778"
      }
    }
  }
}
```

### Connectivity

| Target | URL |
|--------|-----|
| iOS Simulator | `http://127.0.0.1:9778` |
| Android Emulator | Run `adb reverse tcp:9778 tcp:9778`, same URL |
| Physical device | Use `setupBridge({ bindAllInterfaces: true })` (or `host: "0.0.0.0"`), read the LAN IP from Metro logs, set `EXPO_STATE_MCP_BRIDGE_URL=http://<ip>:9778` |

## MCP tools

- `sqlite_list_tables`, `sqlite_describe_table`, `sqlite_query`, `sqlite_explain`
- `zustand_list_stores`, `zustand_get`, `zustand_set`, `zustand_call`

## Development

```bash
yarn install
yarn build
```

### Environment variables (server)

| Variable | Default |
|----------|---------|
| `EXPO_STATE_MCP_BRIDGE_URL` | `http://127.0.0.1:9778` |
| `EXPO_STATE_MCP_TOKEN` | _(empty — no auth)_ |

## Security

Dev-only surface: binds loopback by default; optional Bearer token; never enables this in release builds (`setupBridge` returns immediately when `__DEV__` is false).

## License

MIT — see [LICENSE](./LICENSE).
