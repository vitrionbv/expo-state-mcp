# Changelog

## 1.0.0

- Single package **`@vitrion/expo-state-mcp`**: `exports` + `react-native` for the in-app bridge; Node/Cursor uses the **`expo-state-mcp`** CLI from the same install.
- Deprecated separate **`@vitrion/expo-state-mcp-bridge`** on npm (merged here).
- Bridge uses `import { Buffer } from "buffer"` — no app-level polyfill.

## Earlier releases

Pre-1.0 used split bridge + MCP packages and older `@expo-state-mcp/*` names. See git tags and history for details.
