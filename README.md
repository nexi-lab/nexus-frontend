# Nexus frontend

React console for a configured Nexus server. Use Node.js 22 and the pnpm version in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run dev
```

Enter the server URL on the login screen. API key login resolves the credential through `GET /v2/auth/whoami`; administrator UI state comes from that response. The server enforces access on every request.

File name and content searches use the same caller credential with native `POST /v2/search/glob` and `/v2/search/grep`. Search errors remain visible, truncated results prompt a narrower query, and clearing or changing a query discards its pending response. Results are held only in memory.

Account password login and Google sign-in open `/account`, where users can update their profile and change a password. Google starts at the selected server's `/auth/oauth/google/authorize` endpoint and finishes with `/auth/oauth/google/callback`. The Rust account service verifies the provider identity and its HttpOnly browser binding before issuing an account JWT. Callback parameters are removed from the address bar.

The tab retains only the account server and JWT in session storage; profile facts are fetched from Rust after a refresh. Native file access uses the separately configured API key and verified `whoami` identity. Account sign-in and sign-out preserve that connection, and rejection of either credential clears only its own session. Account profile roles and zones grant no native permissions.

Both transports require a complete HTTP(S) server URL without embedded credentials, query or fragment. Invalid saved connections require a new connection before sending credentials. Account responses must have the canonical status and JSON shape; native identity requires the server's identity fields. An HTML fallback or incomplete HTTP 200 response cannot establish a session or claim account creation.

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

Opening `/verify-email` without a token lets the user explicitly request a new email. Invalid links offer the same recovery. Refreshing or closing registration does not require saved signup state, and these requests never forward an existing native credential.

Password login, profile refresh/editing and password changes also use the actual Rust account binary. Cases cover unverified accounts, rejected passwords, durable profile edits, independent account/native logout and credential rejection, and the absence of native grants.

The other journeys use a local HTTP protocol fixture. They exercise Google server selection and its Rust callback wire contract, browser cookies, rejected callbacks, revocation, cached administrator flags, native file discovery, explicit errors, truncation, late responses, a 1 MiB login JavaScript budget and a 2 MiB browsing/text budget. Provider navigation is simulated; these tests do not prove a real Google exchange or native credential handoff. File-read faults are configured before navigation and affect reads alone; directory-wide failures have a separate case.

CI builds the account binary from the pinned validated Nexus revision in its workflow and runs the same browser journeys without retries. For local acceptance, build `nexusd-accounts` from that revision and set both paths above. For a locally installed Chrome, set `NEXUS_TEST_CHROME` to its executable path. The test browser uses an isolated profile and blocks external requests. Teardown stops the Rust process and removes the temporary account database.

A separate CI job reuses that Nexus revision's `build_search_fixture.sh` and `test_search_local.py` to build the matching native daemon/plugin and verify the current frontend checkout. It protects native key/relation revocation, Search filtering and actual file operations, and retains sanitized browser evidence. The account browser job keeps its fifteen-minute limit; native acceptance has the same ten-minute test step as Nexus CI, within a thirty-minute job that includes a cold Rust build.

### Native daemon browser acceptance

Build this frontend, then run `scripts/test_search_local.py` from the Nexus repository with `--frontend-checkout <this-checkout>`, `--browser-origin http://127.0.0.1:4173`, and the native daemon/plugin paths. Use `--keyword-only` for this journey. The harness starts an isolated native daemon with TLS and ReBAC, issues temporary credentials, supplies `--search-fixture` to the browser runner, and cleans up the fixture. It retains sanitized results and screenshots.

The browser serves the production frontend on port 4173 and connects directly to the Rust HTTP listener. It verifies bearer identity, explicit browser CORS, non-admin UI restrictions, a readable 401 after warmed credential revocation, and another user's continued access. Real file discovery verifies unreadable-root errors, hidden-file filtering, current content, and relation revocation after warming a search. This journey needs no Google credentials. The native daemon's `NEXUS_HTTP_ALLOWED_ORIGINS` must include the exact frontend origin when the two use different origins.

## Migration status

Identity, status, files and file discovery use native `/v2` endpoints. Registration, email verification, password login, profile edits, password changes and Google callbacks use the Rust account contract. Native credential handoff, account deletion and the remaining `/api/nfs/*` consumers still require work before Python server retirement. The frontend remains a draft until those contracts and real integration acceptance are complete.
