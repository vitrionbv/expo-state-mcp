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

## Publishing to npm

Scoped packages must be published **twice** (bridge and server). Ensure you are logged in (`npm whoami`) and have publish rights for the `@expo-state-mcp` scope on npm.

From the repo root:

```bash
cd packages/bridge && npm publish --access public
cd ../server && npm publish --access public
```

`prepublishOnly` runs `npm run build` automatically.

After publishing, tag Git to match (`v0.1.1`) and push tags.

## Consume from npm (host Expo app)

```bash
yarn add -D @expo-state-mcp/bridge @expo-state-mcp/server
```

`react-native-tcp-socket` ships with `@expo-state-mcp/bridge`; do not add it manually.

## Consume from a host Expo app via `file:`

```json
{
  "devDependencies": {
    "@expo-state-mcp/bridge": "file:../expo-state-mcp/packages/bridge",
    "@expo-state-mcp/server": "file:../expo-state-mcp/packages/server"
  }
}
```

Adjust the relative path to wherever this repo lives next to your app.

After changing bridge/server sources, rebuild (`yarn build` here) and restart Metro / rebuild native if you changed native deps.

## Cursor MCP pointing at local server build

Use `node` + path to `packages/server/dist/cli.js`:

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

For published packages, prefer `npx -y @expo-state-mcp/server` (see root README).

## Tags / releases

Tag releases when you want reproducible Git installs:

```bash
git tag v0.1.1 && git push origin v0.1.1
```

Prefer **npm** (`@expo-state-mcp/bridge`, `@expo-state-mcp/server`) for consumers when possible.
