# Staging and production deployment checklist

Passing local tests does not establish staging or production configuration. Record evidence with these status labels:

- **VERIFIED** — directly tested in the named environment and scope.
- **PASS — LOCAL ONLY** — passed locally; this is not staging evidence.
- **PASS — STAGING** — directly passed against a positively identified staging resource.
- **NOT VERIFIED** — the check has not been completed or lacks adequate evidence.
- **NOT AVAILABLE** — the required staging resource or capability is not available.
- **BLOCKED** — a prerequisite prevents a safe attempt.
- **FAILED** — an attempted check failed; record the exact safe error and follow-up.

Unchecked items are **NOT VERIFIED** unless explicitly marked otherwise. Do not mark a staging item complete unless it was tested against staging.

## Current staging preparation status

- **PASS — LOCAL ONLY:** local unit/security tests, PostgreSQL route integration, browser E2E, lint, production build, Prisma validation/generation, and isolated test-database migration/schema checks. These checks do not contact or validate staging providers.
- **NOT AVAILABLE:** staging PostgreSQL, private S3-compatible bucket, Resend staging sender, Upstash staging Redis, and HTTPS staging hosting.
- **NOT VERIFIED:** staging domain/DNS, HTTPS/cookies, proxy/client-IP behavior, provider behavior, and database backup/restore.
- **BLOCKED:** live staging smoke tests until dedicated staging resources are provided and positively identified.

No production or unknown external infrastructure is authorized by this checklist.

## Required environment configuration

All values must be supplied by the selected deployment platform's secret/environment configuration after each resource is positively identified as staging. Do not populate local secret files with unknown or production values. `.env.staging.example` is only a blank name template.

| Group | Variable | Required for staging | Visibility / notes |
|---|---|---|---|
| DATABASE | `DATABASE_URL` | Required | Server-only secret. Dedicated staging PostgreSQL URL; never point at production or the local test database. |
| AUTH/SESSION | No session secret variable | No separate value | Sessions use cryptographically random tokens, store token hashes and expiry in PostgreSQL, and use the database for validation. Provision a dedicated staging admin through the secure bootstrap procedure. |
| AUTH/SESSION | `DEV_ADMIN_PASSWORD` | Must remain unset | Development seed only; do not seed deployment environments. |
| PUBLIC SITE | `NEXT_PUBLIC_SITE_URL` | Required | Public, non-secret exact HTTPS origin for the staging deployment. Used for origin checks, metadata, and email links. |
| PUBLIC SITE | `STUDIO_CONTACT_EMAIL` | Optional until supplied by the studio | Public, displayed as a `mailto:` link only when valid and non-empty. |
| PUBLIC SITE | `STUDIO_CONTACT_PHONE` | Optional until supplied by the studio | Public, displayed as a `tel:` link only when valid and non-empty. |
| PUBLIC SITE | `STUDIO_FACEBOOK_URL` | Optional until supplied by the studio | Public, displayed only for HTTPS Facebook/Messenger links on the allowlisted domains. |
| STORAGE | `STORAGE_BUCKET` | Required for reference-image uploads | Server-only. Dedicated private staging bucket. |
| STORAGE | `STORAGE_ACCESS_KEY_ID` | Required for reference-image uploads | Server-only, least-privilege staging credential. |
| STORAGE | `STORAGE_SECRET_ACCESS_KEY` | Required for reference-image uploads | Server-only secret; never expose to the browser or logs. |
| STORAGE | `STORAGE_REGION` | Optional if the SDK default `us-east-1` is correct | Server-side setting; provide the actual staging bucket region. |
| STORAGE | `STORAGE_ENDPOINT` | Optional for AWS S3; required when the chosen compatible service needs a custom endpoint | Server-side endpoint, only for a positively identified staging service. |
| STORAGE | `STORAGE_FORCE_PATH_STYLE` | Optional; default is `false` | Server-side boolean; enable only if the selected staging storage requires path-style addressing. |
| EMAIL | `RESEND_API_KEY` | Optional for accepting bookings; required to verify/send staging email | Server-only staging key. Booking persistence does not depend on configured email. |
| EMAIL | `EMAIL_FROM` | Optional for accepting bookings; required to send email | Sender must be verified/authorized by the email provider. |
| EMAIL | `ADMIN_NOTIFICATION_EMAIL` | Required for studio notification coverage; otherwise optional at runtime | Use an explicitly controlled staging recipient, never a customer. |
| EMAIL | `EMAIL_REPLY_TO` | Optional | Use only an approved staging reply-to address. |
| RATE LIMITING | `UPSTASH_REDIS_REST_URL` | Required in production mode, including a production-mode staging deployment | Server-only URL for dedicated staging Redis. |
| RATE LIMITING | `UPSTASH_REDIS_REST_TOKEN` | Required in production mode, including a production-mode staging deployment | Server-only staging secret. Missing/unavailable Upstash fails closed in production mode. |
| SECURITY/PROXY | `TRUST_PROXY_HEADERS` | Optional; keep `false` unless verified | Set to `true` only after proving the staging proxy overwrites forwarded headers. Otherwise proxy headers are ignored. |
| OTHER | `NODE_ENV` | Platform-managed | Must be `production` for production-mode security behavior; never use test/development mode in a deployed staging environment. |
| OTHER | `PORT` | Platform-managed/optional | Use the port assigned by the selected host; no provider or port is assumed here. |
| OTHER | `DATABASE_URL_TEST` | Must not be configured for deployment | Local test-only URL. Guarded test scripts require the exact local disposable test target and do not fall back to `DATABASE_URL`. |

An unset optional feature configuration is not proof that feature behavior works. If image uploads, email, or rate limiting are part of staging sign-off, configure and test their dedicated staging resources first. Resend is best-effort: missing configuration or a provider failure is logged safely and does not roll back the persisted booking or status change. Without email, arrange another monitored way for the studio to receive booking notifications before accepting real inquiries.

## Safe staging deployment procedure

1. Obtain explicit confirmation that the PostgreSQL database, bucket, Redis instance, email sender/recipient, and hostname are dedicated to staging and are separate from production. If any target is ambiguous, stop.
2. Add only the required staging values to the host's secret store. Do not place secrets in Git, command-line arguments, build output, or logs. Configure `DATABASE_URL` and `NEXT_PUBLIC_SITE_URL` for the same staging environment. Do not configure `DATABASE_URL_TEST` or `DEV_ADMIN_PASSWORD` on the deployment.
3. Build the application with the selected supported Node.js runtime using `npm ci` and `npm run build`; start it with `npm run start` or the host's documented equivalent. Confirm the host-assigned port/interface behavior. Do not run schema migrations automatically as part of application startup.
4. Run migrations as a separately approved, single staging release step in an environment where the staging `DATABASE_URL` is injected by the secret manager:

   ```text
   npx prisma migrate status
   npx prisma migrate deploy
   npx prisma migrate status
   ```

   Before applying, review every pending migration and confirm the database identity through the approved platform console/connection metadata without printing the URL. Take/confirm the required staging backup and obtain approval. If the target is uncertain, status is unexpected, or a migration needs review, stop. `migrate deploy` applies committed migrations; it does not create migrations or reset the database. Never use `prisma migrate reset`, `db push`, or `migrate dev` as a staging deployment procedure. No migration command has been run against staging as part of this preparation.
5. Confirm the public HTTPS origin, valid certificate, redirects, and response headers on the actual staging hostname. Test admin mutations with correct, missing, and unrelated `Origin` headers; the expected origin must match exactly. Do not enable `TRUST_PROXY_HEADERS` until the actual proxy behavior is verified.
6. Using only a dedicated staging admin and a controlled synthetic email recipient, run a browser booking smoke test and verify persistence, idempotent retry, admin access/status/note/audit flow, and expected notifications. Verify unauthenticated admin access is denied. Do not use real customer data.
7. If image uploads are in scope, upload only a synthetic JPEG/PNG/WebP file; verify validation, private bucket policy, authenticated short-lived signed reads, anonymous access denial, and cleanup. Do not use real customer images.
8. Verify staging Upstash limits and production-mode fail-closed behavior against the dedicated staging instance. Confirm source-IP identification behind the deployed proxy; `unknown` is a shared source bucket and can throttle multiple clients together.
9. Inspect the relevant staging logs for sensitive data and review provider delivery/retention/backup evidence. Record each result as **PASS — STAGING**, **FAILED**, **NOT VERIFIED**, **NOT AVAILABLE**, or **BLOCKED** with safe evidence; do not include credentials, URLs containing credentials, customer data, session tokens, or signed URLs.

The repository has no dedicated health/readiness endpoint. A generic process health check would not prove database, storage, email, or rate-limit readiness. Use the host's liveness facility if needed, then verify readiness through the staged migration status and controlled functional smoke flow above. No health endpoint is added as part of preparation.

## Application

- [ ] Run and retain the production build result.
- [ ] Configure required environment variables in the deployment platform's secret store; never commit them.
- [ ] Confirm the production site URL is valid and uses HTTPS.
- [ ] Configure production domain, DNS records, and a valid HTTPS certificate.
- [ ] Confirm the supported Node.js runtime and process/start command for the selected platform.
- [ ] Confirm the app binds to the platform-provided interface and port.
- [ ] Review legal/privacy content before accepting real booking data.

## Database

- [ ] Configure `DATABASE_URL` for the intended production PostgreSQL database; do not use a local/test URL.
- [ ] Confirm connection pooling and provider connection limits for the selected runtime.
- [ ] Review the existing migrations and run `prisma migrate deploy` only through an approved production change procedure.
- [ ] Verify automated backups, retention, and point-in-time recovery with the database provider.
- [ ] Document and rehearse a restore procedure using a non-production recovery target.
- [ ] Document a migration rollback/forward-fix procedure; Prisma migrations are not automatically reversible.
- [ ] Configure database health, capacity, and connection monitoring.

## Storage

- [ ] Configure a dedicated private bucket and least-privilege server-side credentials.
- [ ] Confirm bucket policy blocks anonymous reads and writes; do not rely only on application behavior.
- [ ] Confirm CORS settings only if required by the chosen upload architecture.
- [ ] Verify signed reads are admin-authorized and short-lived.
- [ ] Define object retention, deletion, lifecycle, and backup/versioning requirements.
- [ ] Document cleanup for abandoned objects and failed booking workflows.
- [ ] Verify provider-level backup/versioning and restoration if required.

## Email

- [ ] Verify the sending domain and configure `EMAIL_FROM`.
- [ ] Configure and confirm `ADMIN_NOTIFICATION_EMAIL` and optional `EMAIL_REPLY_TO`.
- [ ] Store `RESEND_API_KEY` only in the deployment secret store.
- [ ] Verify booking and allowed status emails with synthetic recipients in an isolated environment.
- [ ] Configure delivery, bounce, and provider-failure monitoring.

## Rate limiting and proxy

- [ ] Configure production Upstash REST URL/token with a dedicated production instance/database.
- [ ] Confirm production requests fail closed if rate limiting is unavailable.
- [ ] Confirm hosting supplies a reliable client IP; if proxy headers are used, verify the trusted proxy sanitizes and overwrites them.
- [ ] Set `TRUST_PROXY_HEADERS=true` only after that proxy behavior is confirmed.
- [ ] Verify the shared `unknown` source bucket cannot cause unacceptable cross-client throttling in the selected hosting runtime.

## Security

- [ ] Verify secure session cookies, authentication, authorization, and logout behavior over production HTTPS.
- [ ] Verify mutation Origin configuration and rejection behavior for the production site URL.
- [ ] Verify response security headers and ensure every production subdomain supports HTTPS. The application sends production HSTS with `includeSubDomains`; do not deploy it under a production hostname until that requirement is met.
- [ ] Review secret exposure, rotation, access, and incident response procedures.
- [ ] Create the initial administrator using a unique strong password through the approved bootstrap procedure.
- [ ] Confirm no development seed or default/test credentials are used in production.
- [ ] Review request-size limits against provider/runtime limits; application Content-Length guards do not fully constrain chunked bodies.
- [ ] CSP is not implemented; evaluate separately only after auditing required resource origins.

## Monitoring and operations

- [ ] Configure centralized application logs with access controls and appropriate retention.
- [ ] Confirm logs omit credentials, session tokens, full booking descriptions, internal notes, and signed storage URLs.
- [ ] Configure error monitoring and alerting without collecting sensitive request bodies.
- [ ] Configure database, object-storage, email-delivery, and rate-limit monitoring.
- [ ] Document incident response and service-provider escalation paths.
- [ ] Verify operational runbooks for failed/abandoned `PROCESSING` bookings; automatic recovery is not implemented.

## Verification status

- **PASS — LOCAL ONLY:** The local test suite and isolated test database checks have been run; they do not verify any live provider or staging deployment.
- **NOT AVAILABLE:** Staging PostgreSQL, S3-compatible storage, Resend, Upstash, HTTPS hosting, and staging DNS/domain have not been supplied/positively identified.
- **NOT VERIFIED:** Staging deployment, proxy/client-IP behavior, cookies over HTTPS, provider policies, backups/restore, retention, and monitoring.
- **BLOCKED:** Staging smoke and sign-off until dedicated staging resources are provided and their identity is confirmed.

The blank [.env.staging.example](./.env.staging.example) is a variable-name template, not evidence that staging resources exist. Keep all staging verification items unchecked until tested against the actual staging resources.

## Abandoned `PROCESSING` booking procedure

Automatic takeover is intentionally not implemented. When a `PROCESSING` row is identified:

1. Do not retry it with altered data, mark it complete, re-upload files, or delete it automatically.
2. Have an authorized operator inspect the row and its audit history using a read-only query, and establish whether its originating request/runtime invocation is still active using the hosting platform's execution records.
3. If the invocation may still be active or cannot be ruled out, wait and escalate; do not take ownership.
4. If it is confirmed inactive, reconcile persisted image metadata against the private object prefix for that booking using authorized provider tools. Do not delete an object unless its association and orphan status are established.
5. Review application logs for completed processing/email side effects. A `PROCESSING` row normally precedes email dispatch, but logs and DB state must be checked; never resend email or mark complete merely to clear the state.
6. Record an operator-approved remediation decision and perform it only under a separately reviewed recovery procedure. No automated recovery or safe self-service remediation tool exists currently.
