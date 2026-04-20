# Development workflow

## Monorepo

```bash
yarn install
yarn build
```

Or per package:

```bash
yarn workspace @expo-state-mcp/bridge build
yarn workspace @expo-state-mcp/server build
```

## Consume from a host Expo app via `file:`

In the host app `package.json`:

```json
{
  "dependencies": {
    "react-native-tcp-socket": "^6.4.1"
  },
  "devDependencies": {
    "@expo-state-mcp/bridge": "file:../expo-state-mcp/packages/bridge",
    "@expo-state-mcp/server": "file:../expo-state-mcp/packages/server"
  }
}
```

Adjust the relative path to wherever this repo lives next to your app.

After changing bridge/server sources, rebuild (`yarn build` here) and restart Metro / rebuild native if you changed native deps.

## Cursor MCP pointing at local server build

Use `node` + absolute path to `packages/server/dist/cli.js`, or a path relative to the app repo:

```json
{
  "mcpServers": {
    "expo-state-mcp-dev": {
      "command": "node",
      "args": ["../expo-state-mcp/packages/server/dist/cli.js"],
      "env": {
        "EXPO_STATE_MCP_BRIDGE_URL": "http://127.0.0.1:9778"
      }
    }
  }
}
```

## Tags / releases

Tag releases (`v0.1.0`) when you want reproducible installs from Git:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Consumers can pin `file:` deps or install from npm once published.
