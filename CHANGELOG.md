# Changelog

## [1.1.0](https://github.com/vitrionbv/expo-state-mcp/compare/expo-state-mcp-v1.0.0...expo-state-mcp-v1.1.0) (2026-04-20)


### Features

* initial [@expo-state-mcp](https://github.com/expo-state-mcp) bridge + MCP server ([5cbe9f7](https://github.com/vitrionbv/expo-state-mcp/commit/5cbe9f741f703cd26291d0f68a1c976517a569d4))


### Bug Fixes

* pin publishConfig.registry to registry.npmjs.org ([4039fe3](https://github.com/vitrionbv/expo-state-mcp/commit/4039fe3271dd2a27d7937202555100b1b0ac2a51))
* trigger patch release ([8e7d969](https://github.com/vitrionbv/expo-state-mcp/commit/8e7d969cf0487c520b569d358741edbeca838df1))

## 1.0.0

- Single package **`@vitrion/expo-state-mcp`**: `exports` + `react-native` for the in-app bridge; Node/Cursor uses the **`expo-state-mcp`** CLI from the same install.
- Deprecated separate **`@vitrion/expo-state-mcp-bridge`** on npm (merged here).
- Bridge uses `import { Buffer } from "buffer"` — no app-level polyfill.

## Earlier releases

Pre-1.0 used split bridge + MCP packages and older `@expo-state-mcp/*` names. See git tags and history for details.
