# Changelog

## [1.2.0](https://github.com/vitrionbv/expo-state-mcp/compare/expo-state-mcp-v1.1.1...expo-state-mcp-v1.2.0) (2026-04-20)


### Features

* multi-device MCP identity and device-stamped responses ([7170494](https://github.com/vitrionbv/expo-state-mcp/commit/71704947bfa7fe394ffa21a7583582bebaf59b7a))
* multi-device MCP identity and device-stamped responses ([d415db5](https://github.com/vitrionbv/expo-state-mcp/commit/d415db5d0470c36611ca341d66f521412e7ca08b))

## [1.1.1](https://github.com/vitrionbv/expo-state-mcp/compare/expo-state-mcp-v1.1.0...expo-state-mcp-v1.1.1) (2026-04-20)


### Bug Fixes

* **ci:** drop setup-node registry-url so npm publish uses OIDC not GITHUB_TOKEN ([1989703](https://github.com/vitrionbv/expo-state-mcp/commit/19897033dc0a1b35ec60abde8154bfdd4197bd45))
* **ci:** grant id-token:write explicitly on npm publish jobs for OIDC ([fbd46e6](https://github.com/vitrionbv/expo-state-mcp/commit/fbd46e6eff34e689307260ccd8dab58f852d0f02))
* **ci:** pin Node 22.14+ and npm 11.5+ for npm Trusted Publishing ([c9d618a](https://github.com/vitrionbv/expo-state-mcp/commit/c9d618a3035c3a2cf81a145ed161079e3feb3bdd))
* **ci:** use Node 24 for npm 11.5+; drop fragile global npm upgrade on Actions ([92440d7](https://github.com/vitrionbv/expo-state-mcp/commit/92440d7d76df4987b3914af009d047b074e28800))
* **ci:** use NPM_PUBLISH_TOKEN for workflow_dispatch publish-retry (OIDC is push-only) ([acc4331](https://github.com/vitrionbv/expo-state-mcp/commit/acc433174de66b41a31ed4a424f41dcc1a524523))
* derive MCP server version from package.json ([d5f734b](https://github.com/vitrionbv/expo-state-mcp/commit/d5f734bffac09ad8344d72788aa0586b51e3dd2e))

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
