# Development

## Build

```bash
yarn install
yarn build
```

Outputs **`dist/app/`** (React Native bridge) and **`dist/cli/`** (Node MCP + `expo-state-mcp` bin). `dist/` is gitignored — run `yarn build` before publishing or when using `file:` from a host app.

## Publishing (maintainers)

Package: **`@vitrion/expo-state-mcp`** under the [Vitrion org](https://www.npmjs.com/settings/vitrion/packages). OTP is usually required:

```bash
yarn build
npm publish --access public --otp=<code>
```

`prepublishOnly` runs the build. Optional: `git tag v1.x.x && git push origin v1.x.x`, then `npm view @vitrion/expo-state-mcp version` to verify.

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
