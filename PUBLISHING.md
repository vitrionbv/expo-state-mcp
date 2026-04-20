# Publishing to npm (maintainers)

## 1. Create the scope on npm

The packages are published under the **`@expo-state-mcp`** scope. The first publish will fail with `404 Not Found` / `PUT ... Not found` until that **organization** exists on npm and your user can publish to it.

1. Sign in at [npmjs.com](https://www.npmjs.com).
2. Create an organization named **`expo-state-mcp`** (same name as the scope):  
   [Create an organization](https://www.npmjs.com/org/create)  
   (Free tier is enough for public scoped packages.)

Alternatively, add your npm user as an **owner** of an existing `@expo-state-mcp` org if someone else created it.

## 2. Log in locally

```bash
npm login
npm whoami
```

## 3. Publish both packages

From this repo, using **npm** (not Yarn) so `prepublishOnly` runs cleanly:

```bash
cd packages/bridge
npm publish --access public

cd ../server
npm publish --access public
```

`prepublishOnly` runs `npm run build` before upload.

## 4. Tag Git (optional)

```bash
git tag v0.1.1
git push origin v0.1.1
```

## 5. Verify

```bash
npm view @expo-state-mcp/bridge version
npm view @expo-state-mcp/server version
```

Consumers can then:

```bash
yarn add -D @expo-state-mcp/bridge @expo-state-mcp/server
```

and use Cursor config:

```json
{
  "command": "npx",
  "args": ["-y", "@expo-state-mcp/server"]
}
```
