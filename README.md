# Nexus frontend

React console for a configured Nexus server. Use Node.js 22 and the pnpm version in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run dev
```

Enter the server URL on the login screen. API key login resolves the credential through `GET /v2/auth/whoami`; administrator UI state comes from that response. The server enforces access on every request.

Google sign-in starts at the selected server's `/auth/oauth/google/authorize` endpoint. The server must verify the provider identity and browser binding, then return the user's own Nexus credentials. New users review their account information before confirmation. The frontend does not contain a shared login credential or verify Google identities itself.

## Verification

```sh
pnpm run typecheck
pnpm run build
pnpm exec playwright install chromium
pnpm run test:e2e
```

Browser tests serve the production build against a local HTTP protocol fixture. They exercise server selection, credential replacement, account confirmation, browser cookies, rejected callbacks, revocation, cached administrator flags, and a 1 MiB login JavaScript budget. Provider navigation is simulated; these tests do not prove a real Google exchange or the Rust account backend. Native daemon authorization and revocation are tested in nexus-vfs.

CI runs the same browser journeys without retries. For a locally installed Chrome, set `NEXUS_TEST_CHROME` to its executable path. The test browser uses an isolated profile and blocks external requests.

## Migration status

The current identity and status requests use native `/v2` endpoints. Account routes and the console's remaining `/api/nfs/*` consumers still require migration before Python server retirement. This branch is not a complete frontend migration.
