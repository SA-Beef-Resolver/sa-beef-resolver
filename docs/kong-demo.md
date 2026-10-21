# Kong API Gateway: short demo script

Replace `192.168.1.102` with the Wi-Fi IPv4 address from `ipconfig` if it changes (also update `KONG_PUBLIC_HOST` in `.env`, then run `docker compose up -d kong`).
Run the `curl` / `grpcurl` commands in **Git Bash**.

## Before recording

```bash
docker compose up -d --build kong web-gateway
docker compose ps          # kong must show "healthy"
```

| What | URL |
| --- | --- |
| REST through Kong | `http://192.168.1.102:8000` |
| gRPC through Kong (HTTP/2) | `192.168.1.102:9080` |
| Kong Admin API | `http://192.168.1.102:8001` |
| Kong Manager (GUI) | `http://192.168.1.102:8002` |
| Web app (not through Kong) | `http://127.0.0.1:8081` |

## Script (about 2 minutes)

### 1. Show the IP
Run `ipconfig` and point at the IPv4 address under Wireless LAN adapter Wi-Fi.

### 2. Services and Routes — the screenshots for the assignment
Open `http://192.168.1.102:8002` → **Gateway Services**, then **Routes**.

| Service | Upstream | Route(s) |
| --- | --- | --- |
| `beef-rest-service` | `http://beef-crud-service:3000` | `/api/beefs` |
| `evidence-grpc-service` | `grpc://evidence-service:50051` | `/humanresolve.argument.v1.AuthenticationService`, `/humanresolve.argument.v1.ArgumentService` (protocol `grpc`) |
| `ai-result-service` | `http://ai-api:8000` | `/ai/` |

### 3. Prove the routes work
```bash
# REST: 401 because a JWT is required; the Via: kong header proves the request went through Kong
curl -i http://192.168.1.102:8000/api/beefs

# REST (AI service)
curl http://192.168.1.102:8000/ai/health

# gRPC through Kong (no token needed for Register)
grpcurl -plaintext -import-path EvidenceAndArgumentSubmission/proto -proto evidence_argument.proto \
  -d '{"email":"prof@example.com","password":"Passw0rd!Demo1","display_name":"Prof Demo"}' \
  192.168.1.102:9080 humanresolve.argument.v1.AuthenticationService/Register
```
Register fails with `AlreadyExists` if you reuse the email; change it for each take.

### 4. Close
Show `kong/kong.yml` and the `kong` block in `docker-compose.yml`.

## Optional extras
- `postman/` holds a Postman collection and environment for the REST routes (import both, select the **Kong LAN** environment). Folder **A** registers/logs in two users through the web gateway (`:8081`, not Kong) and stores `token` and `person_b_id` automatically; tokens last 1 hour, so re-run "Login user A" when they expire. Postman cannot store gRPC requests in a collection, so gRPC through Kong is shown with `grpcurl` (step 3).
- DataGrip: PostgreSQL `localhost:5432`, db `evidence_db`, user `evidence`, password `evidence-local-only`; MongoDB `mongodb://localhost:27017/?directConnection=true`, db `ai_resolution_db`; SQLite: run `scripts\export-sqlite.cmd` and open `db-snapshot\beef-resolver.db`.
- If port 5432 or 27017 is already used by another container, stop it or set `POSTGRES_HOST_PORT` / `MONGO_HOST_PORT` in `.env`.
