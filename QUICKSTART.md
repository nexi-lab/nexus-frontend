# Local quick start

Use Node.js 22 and the pnpm version declared in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run dev
```

Open the Vite URL printed in the terminal. Choose the server for each connection:

| Flow | Server and credential | Result |
| --- | --- | --- |
| Files and Search | Native Rust HTTP listener, existing API key | `GET /v2/auth/whoami` resolves the file identity; file and Search requests carry that key. |
| Human account | Rust account HTTP service, password or Google sign-in | `/account` manages profile and password with an account JWT. |
| Registration | Rust account HTTP service | Create an account, request a verification email and open the delivered link before password login. |

Use a complete HTTP(S) server URL. For an existing local account database, follow the [account service configuration](https://github.com/nexi-lab/nexus/blob/develop/rust/services/accounts/README.md); its default HTTP listener is `http://127.0.0.1:12016`. SMTP and Google are configured on that service. The frontend calls its `/auth/*` HTTP adapter, which shares the gRPC account implementation.

Account login and native connection are independent. Signing in to an account preserves an existing file connection. File access requires its own native credential; the native server determines permissions on every request.

For native requests from a different browser origin, include the exact frontend origin in the daemon's `NEXUS_HTTP_ALLOWED_ORIGINS`. The account service runs behind a gateway for external access; its Google browser binding requires the account API and frontend on the same site, HTTPS and credentialed requests. See the account service configuration for the complete contract.

In development, `VITE_NEXUS_API_URL` can supply the initial native server address. The connection screen also accepts it directly. Production users select their server in the UI.

## Verify locally

```sh
pnpm run typecheck
pnpm run build
pnpm run preview
```

The [README](README.md#verification) documents the real Rust account/SMTP browser fixtures and native daemon acceptance. Those runners create isolated test data and clean up their processes. Live Google acceptance is separate.

## Migration scope

Basic native files, Search and the Rust account flows above are implemented. Remaining business pages still call `/api/nfs/*` and require their existing backend until migration is complete. The [acceptance checklist](https://s.shareone.vip/md/nexus-search-local-acceptance) records completed validation and the remaining work. The frontend PR stays draft while that work and complete integration acceptance are pending.
