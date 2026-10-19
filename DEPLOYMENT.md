# Frontend hosting

The [Firebase workflow](.github/workflows/firebase-deploy.yml) deploys the production site on pushes to `main` and on an explicit workflow dispatch. Merging a frontend PR into `main` publishes the site. Keep the migration PR draft until its application contracts and integration acceptance are complete.

## Current build contract

The workflow uses Node.js 22, the pnpm version in `package.json`, `pnpm install --frozen-lockfile` and `pnpm run build`. [firebase.json](firebase.json) serves `dist`, configures asset caching and rewrites browser routes to `index.html`.

Deployment uses these existing GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Hosting deployment identity |
| `FIREBASE_PROJECT_ID` | Target Firebase project |

Users enter server URLs and credentials through the connection and account pages.

## Serving requirements

- Native files and Search use the configured Rust HTTP listener and a separately verified native API key. For different origins, the daemon allows the exact frontend origin through `NEXUS_HTTP_ALLOWED_ORIGINS`.
- Human account requests use the Rust account HTTP adapter. That service binds loopback listeners; a gateway owns external TLS and routing. Google login requires the account API and frontend on the same site, HTTPS and credentialed requests for the HttpOnly binding cookie. Follow the [account service configuration](https://github.com/nexi-lab/nexus/blob/develop/rust/services/accounts/README.md).
- Browser paths such as `/account`, `/verify-email` and the registered Google callback must reach the SPA. Callback and verification URLs must match the account service configuration.
- Remaining `/api/nfs/*` business consumers still require migration before Python server retirement. Account deletion and live Google acceptance remain pending. Native identity is connected explicitly and stays independent of account login.

Use the [local quick start](QUICKSTART.md) and [acceptance checklist](https://s.shareone.vip/md/nexus-search-local-acceptance) before release. Tencent deployment and gateway changes require the separately agreed production plan; this migration has not changed those systems.
