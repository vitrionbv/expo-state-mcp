# `@expo-state-mcp/bridge`

In-app HTTP bridge for **Expo SQLite** + **Zustand**, intended for local development only (`__DEV__`). Pair with `@expo-state-mcp/server` (MCP stdio) so Cursor can inspect and mutate running app state.

See the [repository README](../../README.md) for setup.

## Dependencies

- **`react-native-tcp-socket`** is bundled as a normal dependency — consumers do not install it separately.

## Peer dependencies

- `expo-sqlite`
- `zustand`
- `react`, `react-native`

Optional (for LAN IP hint in logs): `@react-native-community/netinfo`
