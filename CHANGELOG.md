# Changelog

## 0.1.1

- **npm**: `@expo-state-mcp/bridge` now lists `react-native-tcp-socket` as a runtime **dependency**, so host apps only add `@expo-state-mcp/bridge` / `@expo-state-mcp/server` (typically as devDependencies); no separate `react-native-tcp-socket` install.
- **publish**: `prepublishOnly` build + `publishConfig.access: public` for scoped packages.

## 0.1.0

- Initial release (Git): bridge + MCP server packages.
