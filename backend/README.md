# AudEat backend

Spring Boot 4 REST API (Java 17+, Maven) on PostgreSQL. H2 in PostgreSQL mode is available as a
no-setup fallback for development and the default test run.

## Run locally

With Docker (PostgreSQL 18, same as production):

```sh
docker compose up -d                                          # PostgreSQL on localhost:5433
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev,postgres
```

Without Docker, `-Dspring-boot.run.profiles=dev` uses an H2 file database in `data/` instead
(git-ignored; delete it to reset).

The `dev` profile (and `demo`, for the class demo on Azure) seeds demo data on first start: an
inspector, `inspector@audeat.test`, and one owner per store, `owner.blueplate@audeat.test`,
`owner.corner@audeat.test` and `owner.harbor@audeat.test`, all with the password `audeat-demo`, plus
inspections, tickets and photos dated relative to that day. The frontend mock seeds the same data.
To refresh the dates, delete `data/` or run `docker compose down -v`.

The API starts on http://localhost:8080. To use it from the frontend, create `frontend/.env.local`
containing `VITE_API_URL=http://localhost:8080` and run `npm run dev` there.

The compose database is `audeat` on `localhost:5433`, user and password `audeat` (local use only),
so pgAdmin or `psql` can connect to it. `docker compose down` stops it and keeps the data;
`docker compose down -v` also deletes the data.

## Test

```sh
./mvnw test              # H2, no Docker needed
./mvnw test -Ppostgres   # the same tests on a throwaway PostgreSQL 18 container (needs Docker)
```

Full-stack browser tests (start the API first, as above, with `--audeat.cors.allowed-origins=http://localhost:5179` added to `spring-boot.run.arguments`):

```sh
cd ../frontend && E2E_API_URL=http://localhost:8080 npm run test:e2e
```

## Configuration (production)

| Variable | Purpose |
|---|---|
| `SPRING_DATASOURCE_URL` | PostgreSQL JDBC URL, e.g. `jdbc:postgresql://host:5432/audeat` |
| `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD` | Database credentials |
| `AUDEAT_JWT_SECRET` | Token signing key, at least 32 bytes (e.g. `openssl rand -base64 48`) |
| `AUDEAT_CORS_ORIGINS` | Comma-separated frontend origins, e.g. the Vercel URL |
| `AUDEAT_TIME_ZONE` | Zone whose date is "today" for deadlines and overdue tickets (default `America/Chicago`) |
| `SPRING_PROFILES_ACTIVE=demo` | Optional: seed the demo data (see above) for a class demo |

The app refuses to start if the database URL or JWT secret is missing. Flyway creates the schema
from `src/main/resources/db/migration` on startup.

## API

"Planned" rows are the agreed contract; the feature PRs build them. Owner routes never take a
store id: they always use the signed-in owner's store.

| Method and path | Auth | Purpose | Responses | Status |
|---|---|---|---|---|
| `GET /api/stores` | Public | Stores a store owner can register against (US 12) | 200 `[{id, name, address}]` | done |
| `POST /api/auth/register` | Public | Create an account (US 12) | 201 user; 400 `{errors: {field: message}}`; 409 email taken | done |
| `POST /api/auth/login` | Public | Log in (US 13) | 200 `{token, user}`; 401 `Invalid email or password.` | done |
| `GET /api/auth/me` | Bearer token | The signed-in user | 200 user; 401 | done |
| `GET /api/photos/{id}` | Any role | Photo bytes (AC 2.2, 4.2, 5.1) | 200 image with `Cache-Control: private, max-age=86400`; 404 `Photo not found.` (an owner asking for another store's photo, or one from a draft inspection) | done |
| `GET /api/my-store` | Owner | Store name, address and ticket counts (US 15) | 200 `MyStoreResponse`; 403 for an inspector | done |
| `GET /api/my-store/tickets` | Owner | The store's tickets, open by nearest deadline (overdue first), then approved (US 4, 10) | 200 `[TicketSummaryResponse]`; 403 for an inspector | done |
| `GET /api/my-store/tickets/{ticketId}` | Owner | One ticket with its issue photos, submissions and follow-ups (AC 4.2) | 200 `TicketDetailResponse`; 404 `Ticket not found.` (missing, non-numeric or another store's id) | done |
| `POST /api/my-store/tickets/{ticketId}/submissions` | Owner | Send evidence of the fix (US 5); multipart `comment` + 1-5 `files` (JPEG, PNG or WebP by content; empty file parts ignored). One transaction: the ticket goes from `open` or `rejected` to `awaiting_review` with a new submission (`decision` null) and its photos, or nothing is saved | 201 `TicketDetailResponse`; 400 `errors.files` `Evidence is required.` (AC 5.2), `Upload at most 5 files.`, `Evidence must be a JPEG, PNG or WebP image.`, `errors.comment` `Describe how you fixed the issue.`, `Use 1000 characters or fewer.`; 404 `Ticket not found.` (missing, non-numeric or another store's id); 409 `This ticket is not waiting for evidence.` (checked before the fields); 409 `This ticket was just updated. Reload and try again.`; 413 `Each file must be 5 MB or smaller.`; 403 for an inspector | done |
| `GET /api/my-store/inspections` | Owner | The store's inspection history (US 9) | 200 `[InspectionSummaryResponse]` | planned |
| `POST /api/stores/{storeId}/inspections` | Inspector | Start, or resume, the caller's draft (AC 1.1) | 201 or 200 `InspectionDetailResponse`; 404 `Store not found.` | planned |
| `GET /api/inspections/{id}` | Inspector | One inspection (AC 2.2, 7.3, 8.2) | 200 `InspectionDetailResponse`; 404 `Inspection not found.` | planned |
| `PUT /api/results/{resultId}` | Inspector | Mark a requirement `{compliant, comment}` (AC 1.2, 1.3, 2.1) | 200 `ResultResponse`; 400; 404 `Result not found.`; 409 | planned |
| `POST /api/results/{resultId}/photos` | Inspector | Add an issue photo; multipart `file` (AC 2.2) | 201 `{id}`; 400; 404; 409; 413 | planned |
| `POST /api/inspections/{id}/submit` | Inspector | Submit a draft or a follow-up (AC 1.2, 1.3, 7.3) | 200 `InspectionDetailResponse`; 400 `errors["results.{id}"]`; 404; 409 | planned |
| `GET /api/stores/{storeId}/inspections` | Inspector | A store's inspection history (US 8) | 200 `[InspectionSummaryResponse]`; 404 `Store not found.` | planned |
| `POST /api/results/{resultId}/ticket` | Inspector | Create a ticket `{requiredRemediation, deadline}` (US 3) | 201 `TicketDetailResponse`; 400 `errors.deadline` `A deadline is required.`; 404; 409 | planned |
| `GET /api/tickets?status=awaiting_review` or `follow_up_scheduled` | Inspector | Review queue and follow-ups to complete (US 6, AC 7.3) | 200 `[TicketSummaryResponse]`; 400 `Unknown ticket status.` | planned |
| `GET /api/tickets/{ticketId}` | Inspector | One ticket (US 6) | 200 `TicketDetailResponse`; 404 `Ticket not found.` | planned |
| `POST /api/tickets/{ticketId}/review` | Inspector | `{decision: approved \| rejected \| follow_up, comment, followUpDate}` (US 6, 7) | 200 `TicketDetailResponse`; 400 (e.g. `The follow-up date must be in the future.`); 404; 409 | planned |

A user is `{id, name, email, role, storeId, storeName}` with `role` either `inspector` or `owner`.
Every other route requires `Authorization: Bearer <token>` and returns 401 without it (AC 13.3).
The wrong role for a route gets 403 `{"message": "You are not authorized to view this page."}`
(AC 9.2, 15.2). A record outside the caller's scope gets the same 404 as a missing one. 409 means
the record's state does not allow the request; two requests changing the same ticket at once get
409 `This ticket was just updated. Reload and try again.` for the one that lost. A file over 5 MB
gets 413 `Each file must be 5 MB or smaller.`

Dates are `YYYY-MM-DD`, timestamps ISO-8601 instants and enums lower-case. Ticket `status` is
`open`, `awaiting_review`, `rejected`, `follow_up_scheduled` or `approved`; `overdue`,
`daysRemaining` and `daysOverdue` are computed on the server against today in `AUDEAT_TIME_ZONE`,
and a ticket due today is not overdue. The response records live in `inspection/`, `remediation/`
and `owner/`:

| Record | Fields |
|---|---|
| `InspectionSummaryResponse` | `id, inspectionDate, inspectorName, violationCount, followUp` |
| `InspectionDetailResponse` | `id, storeId, storeName, inspectorName, inspectionDate, status (draft \| submitted), submittedAt, followUpOfTicketId, violationCount, results: [ResultResponse]` (checklist order) |
| `ResultResponse` | `id, requirementId, requirement, compliant (true \| false \| null), comment, photoIds, resolved (null unless flagged), ticket: {id, status, overdue, deadline, daysRemaining, daysOverdue, requiredRemediation} \| null` |
| `TicketSummaryResponse` | `id, status, overdue, deadline, daysRemaining, daysOverdue, requiredRemediation, issue: {resultId, requirement, comment, resolved}, storeId, storeName, inspectionId, inspectionDate, followUpDate, followUpInspectionId` |
| `TicketDetailResponse` | every `TicketSummaryResponse` field with `issue.photoIds` added, plus `createdAt, approvedAt, submissions: [{id, comment, submittedAt, evidencePhotoIds, decision (null \| approved \| rejected \| follow_up), reviewComment, reviewedAt}], followUps: [{inspectionId, inspectionDate, status, compliant, comment}]` |
| `MyStoreResponse` | `id, name, address, openTicketCount` (tickets not yet approved), `rejectedCount` (tickets sent back for further action) |
