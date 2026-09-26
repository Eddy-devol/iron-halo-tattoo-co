# Production deployment checklist

Passing local tests does not establish production configuration. Use these status labels when recording evidence:

- **VERIFIED** — directly tested in the environment and scope stated.
- **NOT VERIFIED** — no adequate evidence is available.
- **NOT APPLICABLE** — the requirement does not apply to the selected architecture; explain why.
- **REQUIRES HUMAN/PROVIDER ACTION** — an operator or provider must configure or confirm it.

Unchecked items below are **REQUIRES HUMAN/PROVIDER ACTION** until verified; they are not implicitly complete.

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
- [ ] Verify response security headers and that all production subdomains support HTTPS before enabling HSTS with `includeSubDomains`.
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

- **VERIFIED (local/test only):** Unit tests, route integration, browser E2E, production build, lint, Prisma validation/generation, and isolated PostgreSQL migrations/schema checks. See the Phase 2J.7 audit report for the exact run results.
- **NOT VERIFIED:** Staging PostgreSQL, S3, Resend, Upstash, hosting, domain/DNS, HTTPS, backups/restore, provider retention, and monitoring. The only database positively classified in this phase was local disposable PostgreSQL. No external provider or deployment was contacted.
- **REQUIRES OPERATOR ACTION:** Supply and positively identify a dedicated staging database, private bucket, isolated Redis, test email sender and controlled recipients, and HTTPS staging host. Do not use a non-local `DATABASE_URL` until its environment and resource are established.
- **NOT APPLICABLE:** None established in this phase.
- **VERIFIED (configuration only):** Development seed blocks production execution and requires an explicit password; security/error-category regression tests pass. This does not verify staging administrator creation or deployed behavior.

The blank [.env.staging.example](./.env.staging.example) is a variable-name template, not evidence that staging resources exist. Keep the per-environment checklist items above unchecked until their actual resources are verified.

## Abandoned `PROCESSING` booking procedure

Automatic takeover is intentionally not implemented. When a `PROCESSING` row is identified:

1. Do not retry it with altered data, mark it complete, re-upload files, or delete it automatically.
2. Have an authorized operator inspect the row and its audit history using a read-only query, and establish whether its originating request/runtime invocation is still active using the hosting platform's execution records.
3. If the invocation may still be active or cannot be ruled out, wait and escalate; do not take ownership.
4. If it is confirmed inactive, reconcile persisted image metadata against the private object prefix for that booking using authorized provider tools. Do not delete an object unless its association and orphan status are established.
5. Review application logs for completed processing/email side effects. A `PROCESSING` row normally precedes email dispatch, but logs and DB state must be checked; never resend email or mark complete merely to clear the state.
6. Record an operator-approved remediation decision and perform it only under a separately reviewed recovery procedure. No automated recovery or safe self-service remediation tool exists currently.
