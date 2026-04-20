# `@expo-state-mcp/server`

Stdio MCP server that forwards tool calls to `@expo-state-mcp/bridge` over HTTP.

## CLI

After `yarn build`, run:

```bash
node dist/cli.js
```

Or install globally / use `npx` once published. Configure Cursor with `EXPO_STATE_MCP_BRIDGE_URL` pointing at the device or simulator.

See the [repository README](../../README.md).
