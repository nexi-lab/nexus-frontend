# Nexus frontend

React console for a configured Nexus server. Use Node.js 22 and the pnpm version in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run dev
```

Enter the server URL on the login screen. API key login resolves the credential through `GET /v2/auth/whoami`; administrator UI state comes from that response. The server enforces access on every request.

File name and content searches use the same caller credential with native `POST /v2/search/glob` and `/v2/search/grep`. Search errors remain visible, truncated results prompt a narrower query, and clearing or changing a query discards its pending response. Results are held only in memory.

Google sign-in starts at the selected server's `/auth/oauth/google/authorize` endpoint. The server must verify the provider identity and browser binding, then return the user's own Nexus credentials. New users review their account information before confirmation. The frontend does not contain a shared login credential or verify Google identities itself.

## Verification

```sh
pnpm run typecheck
pnpm run build
pnpm exec playwright install chromium
export NEXUS_TEST_ACCOUNTS_BINARY=/path/to/nexus/target/debug/nexusd-accounts
export NEXUS_TEST_ACCOUNTS_SCHEMA=/path/to/nexus/rust/services/accounts/tests/fixtures/users.sql
pnpm run test:e2e
```

Registration and email verification run against the actual Rust account binary, a temporary SQLite database initialized from that source's canonical fixture, and a loopback SMTP server. The browser opens the link delivered by Rust, verifies the durable email fact and checks that registration creates no browser session or native credential. A failed verification request can be resent without registering again. Verification tokens stay in page memory and are removed from the address bar. The selected server must be confirmed before submitting a token.

The other journeys use a local HTTP protocol fixture. They exercise server selection, credential replacement, account confirmation, password changes, browser cookies, rejected callbacks, revocation, cached administrator flags, native file discovery, explicit errors, truncation, late responses, a 1 MiB login JavaScript budget and a 2 MiB browsing/text budget. Provider navigation is simulated; these tests do not prove a real Google exchange or native credential handoff.

CI builds the account binary from the pinned validated Nexus revision in its workflow and runs the same browser journeys without retries. For local acceptance, build `nexusd-accounts` from that revision and set both paths above. For a locally installed Chrome, set `NEXUS_TEST_CHROME` to its executable path. The test browser uses an isolated profile and blocks external requests. Teardown stops the Rust process and removes the temporary account database.

### Native daemon browser acceptance

Build this frontend, then run `scripts/test_search_local.py` from the Nexus repository with `--frontend-checkout <this-checkout>`, `--browser-origin http://127.0.0.1:4173`, and the native daemon/plugin paths. Use `--keyword-only` for this journey. The harness starts an isolated native daemon with TLS and ReBAC, issues temporary credentials, supplies `--search-fixture` to the browser runner, and cleans up the fixture. It retains sanitized results and screenshots.

The browser serves the production frontend on port 4173 and connects directly to the Rust HTTP listener. It verifies bearer identity, explicit browser CORS, non-admin UI restrictions, a readable 401 after warmed credential revocation, and another user's continued access. Real file discovery verifies unreadable-root errors, hidden-file filtering, current content, and relation revocation after warming a search. This journey needs no Google credentials. The native daemon's `NEXUS_HTTP_ALLOWED_ORIGINS` must include the exact frontend origin when the two use different origins.

## Migration status

Identity, status, files and file discovery use native `/v2` endpoints. Registration and email verification use the Rust account contract and create no login credentials. Account login, Google callbacks, native credential handoff and the remaining `/api/nfs/*` consumers still require migration before Python server retirement.
