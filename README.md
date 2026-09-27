# Iron Halo Tattoo Co.

Production-quality foundation for a premium dark editorial tattoo studio site and private consultation intake flow. Built with Next.js App Router, TypeScript, and Tailwind CSS.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`. Use `npm run lint` and `npm run build` for validation.

## Database foundation

The repository contains the current PostgreSQL Prisma schema and committed migrations. Set `DATABASE_URL` in the ignored `.env.local` for the Next.js application, and provide the same intended local development URL to Prisma CLI commands through the process environment or a Prisma-loaded `.env` file. Prisma CLI does not load `.env.local`. Never use `DATABASE_URL_TEST` for ordinary development or deployment.

```bash
npm run db:generate
npx prisma migrate deploy
npm run db:seed
```

`npx prisma migrate deploy` applies only committed migrations and does not create a migration or reset the database. Use `npm run db:migrate -- --name <description>` only when intentionally authoring a new migration against a local development database. Never use `prisma migrate reset` against staging or production. See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for the controlled staging procedure.

The development seed uses only `admin@example.test` and `test@example.test`. It is disabled when `NODE_ENV=production` and requires a unique `DEV_ADMIN_PASSWORD` of at least 12 characters; there is no default password. Set it only in your local shell before `npm run db:seed`, and do not reuse it in staging or production. Create deployment administrators through the approved secure bootstrap process.

## Admin bootstrap

Create the first admin account with:

```bash
npm run admin:create
```

On interactive Windows PowerShell, VS Code, and compatible TTYs, password input is hidden. In a non-interactive terminal where raw input is unavailable, the script falls back to a normal prompt; use an interactive terminal for secure password entry.

See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) before planning a production deployment. It records configuration and operational checks that are still unverified; passing code tests does not mean infrastructure is configured.

For staging planning, [.env.staging.example](./.env.staging.example) lists the expected variable names with blank values only. Copy it to an ignored local file and populate it only with resources confirmed to be isolated staging resources. Never copy production credentials into staging. `DEV_ADMIN_PASSWORD` is for local development seeding only; create a staging administrator through the secure admin bootstrap process.

`prisma validate` needs a syntactically valid `DATABASE_URL` in its process environment but does not connect to that database. For offline schema validation, supply a process-scoped, non-routable placeholder URL; do not replace `DATABASE_URL` with `DATABASE_URL_TEST`. Database commands such as `migrate status` and `migrate deploy` do connect and must run only in the intended environment with its approved secret injected.

## Studio contact and customer confirmations

`STUDIO_CONTACT_EMAIL`, `STUDIO_CONTACT_PHONE`, and `STUDIO_FACEBOOK_URL` are optional public display settings. Set only contact details supplied by the studio; do not use placeholders. Valid configured methods appear on the public site and booking confirmation, while blank or invalid values are omitted. Facebook/Messenger links must use HTTPS and an approved Facebook/Messenger hostname.

Resend remains optional for accepting bookings. Booking data is persisted before the application attempts email delivery; missing email configuration or a provider failure does not roll back that booking or a status change. Configure `RESEND_API_KEY` and `EMAIL_FROM` to enable transactional sending, with `ADMIN_NOTIFICATION_EMAIL` set to a controlled studio inbox. Before accepting real inquiries without email enabled, ensure there is another monitored way to review incoming bookings.

## Routes

- `/` â€” responsive editorial landing page
- `/book` â€” accessible consultation request form
- `/api/bookings` â€” multipart endpoint with server-side field, consent, MIME, size, and count validation
- `/privacy`, `/terms` â€” clearly marked legal-review placeholders
- `/robots.txt`, `/sitemap.xml` â€” generated SEO surfaces
- `/admin/login`, `/admin` â€” authenticated studio console and booking dashboard
- `/admin/bookings/[id]` â€” authenticated booking details, private reference images, workflow controls, and internal notes
- `/api/admin/bookings` â€” authenticated, searchable, status-filtered booking list
- `/api/admin/bookings/[id]` â€” authenticated booking details with short-lived image links

### Archive routes

- `/admin/archive` — authenticated portfolio artwork management
- `/admin/archive/new`, `/admin/archive/[id]` — add and edit artwork
- `/api/admin/archive`, `/api/admin/archive/[id]` — authenticated Archive management
- `/api/archive` — published artwork listing and slug-scoped public image delivery

The Archive uses the existing private S3-compatible storage. Public image delivery resolves only published artwork slugs and never returns storage keys or credentials. Admin previews require the existing database-backed admin session.

### Client documents and manual payment plans

- Admin booking detail includes client record/consent tracking, payment plans and a manual payment ledger.
- Private print routes: `/admin/bookings/[id]/print/confirmation`, `/consent`, `/payment-plan`, `/payment/[paymentId]`, and `/client-packet`. Each route requires the admin session; none are public client links.
- A payment plan uses decimal currency values and a custom due-date/installment schedule. The current ledger supports valid ISO currencies with two fractional digits. Payments are recorded manually, tied to an installment, and cannot exceed that installment or the plan total. Balances/status are calculated from saved payment rows. Recording or completing payment does not change booking or consent status.
- The consent page is a custom studio document, not an official Texas DSHS form. The studio must review and finalize consent wording and operational policy with qualified counsel before use. `TATTOO_CONSENT_TEXT` and `TATTOO_PAYMENT_PLAN_AGREEMENT` are optional server-side configuration values; if absent, the print form clearly indicates that the content is not ready for client signature.
- Client records support DOB, address, ID type, and an optional ID last-four reference; the application does not store full government ID numbers. Admins explicitly record in-person ID verification and completion after confirming the physical signed form. Printing does not mark consent completed.
- Before deployment, apply the additive migration with `npx prisma migrate deploy` only after verifying the intended database target. Do not use `prisma migrate reset`; local route verification uses only the isolated test database.

### Client portal

- `/portal/login` requests a one-time access link using the booking email and reference. Responses do not reveal whether the submitted details match a booking. Links expire after 15 minutes and are single-use.
- A successful link creates a seven-day client session bound to exactly one booking. Client session tokens and unused access tokens are stored only as hashes. The client cookie is HttpOnly, SameSite=Lax, and Secure in production.
- The portal is read-only for payment, booking, and consent data. Consent completion remains an in-person physical-signature process recorded by an administrator; viewing or printing a consent document does not change status.
- Configure the existing `RESEND_API_KEY`, `EMAIL_FROM`, and exact `NEXT_PUBLIC_SITE_URL` values for the deployment. Client access links are sent to the email already stored on the matching booking.
- Client pages and documents use a dedicated safe data projection, omit staff notes, payment notes, audit history, administrator and verification details, and require the booking-bound client session. Archive remains independent.
- Apply the additive `20260927130000_client_portal_auth` migration to each intended database with `npx prisma migrate deploy` after verifying the target. It adds only client access-token and client-session tables and their indexes/foreign keys; it does not alter existing booking or Archive data.

## Booking flow

The form accepts client details, project description, style, placement, scale, color preference, timeframe, and optional reference images. Booking requests persist through Prisma; reference images are validated and stored as private S3-compatible objects with metadata in PostgreSQL. The public API returns only a human-friendly `IH-YYYY-XXXXXX` reference.

## Production notes

The API validates and normalizes input server-side, then persists BookingRequest records through Prisma. The admin dashboard supports booking search, status filtering, pagination, details, authenticated status changes, and append-only internal notes. Admin APIs verify the authenticated database session and return only booking fields needed by the console; reference image URLs are signed for at most five minutes.

## Transactional email (Phase 2G)

Configure these server-only variables when Resend is available:

```text
RESEND_API_KEY=
EMAIL_FROM=
ADMIN_NOTIFICATION_EMAIL=
EMAIL_REPLY_TO=
```

After a booking is committed, the system attempts a customer "request received" confirmation and a studio notification. After an authenticated status change is committed, customer notifications are sent only for `APPROVED`, `DECLINED`, and `NEEDS_INFORMATION`. Other statuses do not currently trigger customer email.

Email delivery is a separate side effect: provider failures are logged safely and never roll back a booking or status change. The public API does not expose provider details. Internal notes, storage keys, signed URLs, credentials, session data, and password hashes are never included in emails. A booking request is not an appointment confirmation.

Phase 2G does not implement appointment scheduling, deposits, payments, customer accounts, SMS, marketing emails, automated reminders, or email analytics. Configure Resend with a verified sender before expecting live delivery; code checks can pass without email credentials.

## Security Hardening (Phase 2H)

Production requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for distributed rate limiting. Development intentionally bypasses rate limiting when those variables are absent; it does not claim production-grade protection.

Source IP extraction uses the framework-provided request IP when available. `X-Real-IP` and `X-Forwarded-For` are ignored by default because clients can spoof them; set `TRUST_PROXY_HEADERS=true` only behind a trusted proxy that sanitizes and overwrites those headers.

Limits are:

- Public booking submissions: 5 per source IP per 15 minutes
- Admin login attempts: 10 per source IP and normalized email per 15 minutes
- Authenticated admin mutations (status changes and notes): 30 per admin and source IP per 15 minutes

Production requests without a working rate-limit service receive a safe `503` rather than silently using an in-memory limiter. Rate-limited responses use `429` and `Retry-After`.

Cookie-authenticated admin mutations validate `Origin` against `NEXT_PUBLIC_SITE_URL`; missing or mismatched origins are rejected. SameSite=Lax, HttpOnly, Secure-in-production, server-side expiry, and hashed session tokens remain enabled.

Responses include `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and frame protection. HSTS is enabled only in production. Uploads remain private and limited to five JPEG/PNG/WebP files at 10MB each with signature validation.

Request size guards reject booking payloads over 55 MiB and admin login/mutation payloads over 64 KiB when a trusted `Content-Length` header is available.

## Testing

The project uses Vitest for unit, security-helper, and isolated PostgreSQL route-integration coverage, plus Playwright for a critical browser flow:

```bash
npm test
npm run test:watch
npm run test:integration
npm run test:e2e
```

`npm test` runs the unit/security helper suite. `npm run test:integration` runs actual Next.js route handlers against the isolated PostgreSQL database. `npm run test:e2e` uses Playwright Chromium and the same guarded test database to submit and retry one synthetic booking, then exercises admin login, status changes, internal notes, and logout in a real browser. Both require the local test container and `DATABASE_URL_TEST`; they stub or remove storage, email, and rate-limit provider configuration and do not contact S3, Upstash, or Resend. Browser tests use synthetic `.example.test` data and clean up their records. Install Chromium once with `npx playwright install chromium`.

Before production, configure and verify:

- Route integration and PostgreSQL concurrency behavior (covered by the local integration suite; browser-level HTTP concurrency is not claimed)
- Private S3 uploads, signed reads, public access denial, and cleanup
- Upstash connection, limits, rejection, and failure behavior
- Resend sender, reply-to, admin notification, customer confirmation, and status messages
- Live S3, Upstash, and Resend behavior (not verified by local tests)

## Production readiness

Current local code verification:

- lint: passing
- production build: passing
- Prisma validation/generation: passing when Prisma CLI is given a process-scoped syntactically valid `DATABASE_URL`
- Vitest unit/security suites: passing

### Isolated PostgreSQL test database

The repository includes [docker-compose.test.yml](./docker-compose.test.yml) for a disposable PostgreSQL test instance bound to `127.0.0.1:55432`. Copy [.env.test.example](./.env.test.example) to `.env.test.local` without changing the target to a production or shared database.

Run the following only after Docker is installed and the local test container is confirmed:

```text
npm run db:test:up
npm run db:test:migrate
npm run db:test:status
npm run db:test:verify
npm run db:test:generate
npm run db:test:down
```

The scripts require `DATABASE_URL_TEST`, reject a missing value, reject equality with `DATABASE_URL`, and require the configured localhost PostgreSQL test target. They never fall back to `DATABASE_URL`. `db:test:verify` checks expected tables, enums, idempotency columns/index, and performs synthetic create/read/unique-conflict/transaction/concurrency checks with cleanup. `test:integration` runs actual route handlers against that database while stubbing S3, Resend, and rate limiting. Do not run destructive Prisma commands against an unknown database. If a disposable test database must be recreated, stop the test container and remove only the named `iron-halo-postgres-test` test resources after independently confirming the target.

The application remains **CONDITIONAL GO** until external services are verified in isolated staging resources, HTTPS/proxy behavior is confirmed, and production operational controls such as backups and monitoring are configured.

Public booking submissions require a valid `Idempotency-Key` header. The booking form generates one key per intentional submission, and retries with the same key return the original reference without creating a second booking or re-uploading images. Reusing a key with different booking data returns `409`. Keys are database-backed and limited to 128 safe characters. A process crash during processing may leave a keyed request marked `PROCESSING`; the application does not automatically reclaim that row because it cannot safely prove that the original process has stopped or resume partially completed image work without risking duplicates. Recovery requires reviewing the row and either completing or compensating for the booking in an isolated operational procedure. Exactly-once external email delivery is not claimed.
