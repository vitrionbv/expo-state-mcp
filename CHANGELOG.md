# Changelog

## 0.1.3

- Re-release of `@vitrion/expo-state-mcp-bridge` (version **0.1.2** is already taken on the registry; use **0.1.3** for new publishes / installs).

## 0.1.2

- **Breaking (rename)**: npm packages now live under the **`@vitrion`** scope:
  - `@vitrion/expo-state-mcp` — MCP server (replaces `@expo-state-mcp/server`)
  - `@vitrion/expo-state-mcp-bridge` — RN bridge (replaces `@expo-state-mcp/bridge`)

## 0.1.1

- **npm**: Bridge package lists `react-native-tcp-socket` as a runtime **dependency**, so host apps only add the two packages (typically as devDependencies); no separate `react-native-tcp-socket` install.
- **publish**: `prepublishOnly` build + `publishConfig.access: public` for scoped packages.

## 0.1.0

- Initial release (Git): bridge + MCP server packages.
