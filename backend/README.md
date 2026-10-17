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

The app refuses to start if the database URL or JWT secret is missing. Flyway creates the schema
from `src/main/resources/db/migration` on startup.

## API

| Method and path | Auth | Purpose | Responses |
|---|---|---|---|
| `GET /api/stores` | Public | Stores a store owner can register against (US 12) | 200 `[{id, name, address}]` |
| `POST /api/auth/register` | Public | Create an account (US 12) | 201 user; 400 `{errors: {field: message}}`; 409 email taken |
| `POST /api/auth/login` | Public | Log in (US 13) | 200 `{token, user}`; 401 `Invalid email or password.` |
| `GET /api/auth/me` | Bearer token | The signed-in user | 200 user; 401 |

A user is `{id, name, email, role, storeId, storeName}` with `role` either `inspector` or `owner`.
Every other route requires `Authorization: Bearer <token>` and returns 401 without it (AC 13.3).
