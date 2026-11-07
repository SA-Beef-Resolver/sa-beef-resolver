# Tester guide: frontend demo

Open **http://127.0.0.1:8081** after the stack is up. Everything below is done in the browser. Use separate browser windows (normal, private, and a second browser or profile) so three people can be signed in at once.

## 1. Start the stack

```bash
docker compose up --build
```

The first start downloads images and the Ollama model (several GB), so it can take a while. It is ready when `docker compose ps` shows `web-gateway`, `evidence-service`, `beef-crud-service`, `ai-api` and both `ai-worker-*` running. The `ollama-init` container exits when the model has been pulled.

Other addresses:

| What | Address |
|---|---|
| App (React frontend + gateway) | http://127.0.0.1:8081 |
| RabbitMQ management UI (user `ai`, password `ai-local-only`) | http://127.0.0.1:8080 |
| Beef REST API (direct, needs a login token) | http://127.0.0.1:3000/api/beefs |
| gRPC evidence service (direct) | 127.0.0.1:50051 |

## 2. Test cases

Disputes belong to two real accounts: the person who creates it (side 1) and the opponent they pick by searching (side 2). Only those two can see it and write arguments. Cast: **Maya** (creator), **Nina** (opponent) and **Carl** (outsider).

| # | Steps | Expected |
|---|---|---|
| 1 | Open the app signed out. | Redirected to **Sign in**. |
| 2 | Register Maya, Nina and Carl (one per window; password of at least 12 characters). | Each lands on **Disputes** with their name top right. |
| 3 | Sign in with a wrong password. | Error: email or password is incorrect. |
| 4 | Maya: **Start a dispute**. In Opponent type `N` (one letter). | Nothing is searched yet (needs 2 letters). |
| 5 | Type `Ni`. | "Nina #xxxx" appears. Maya herself and every email are never shown. |
| 6 | Pick Nina, write a reason, **Create dispute**. | Row "#1 Maya (you) vs Nina". |
| 7 | Nina's window: reload the dispute list. | The same dispute is listed for Nina. |
| 8 | Carl's window: reload the dispute list. | Empty. Opening `/disputes/1` directly shows "You are not a party to this dispute." |
| 9 | Maya: open the dispute. | "You are side 1 (you opened this dispute) against Nina." |
| 10 | Nina: open the dispute. | "You are side 2 (you were named as the opponent) against Maya." |
| 11 | Maya: **+ New argument**, statement, **+ Add evidence** (LINK, URL), Submitted, Save. | Argument card, "submitted, version 1", evidence link. |
| 12 | Maya: **Send to AI as side 1**. | Green message "Sent to the AI as side 1...". There is no side picker. |
| 13 | RabbitMQ UI (Queues tab). | A message was published to an `ai.resolution.work.*` queue. |
| 14 | Nina: Maya's argument shows under "Other people's arguments" with Maya's **name** (not an id). Nina writes her side and clicks **Send to AI as side 2**. | AI panel goes `waiting_for_other_person` then `resolved` (1 to 2 minutes on CPU). |
| 15 | AI panel when resolved. | Summary, both perspectives, missing information, proposed resolution; **Show all AI rounds** lists the rounds. |
| 16 | Maya: **Mark resolved** on the dispute, then try **+ New argument** and Save. | The save is refused ("dispute is already resolved"). **Reopen** makes it work again. |
| 17 | Nina: **Edit** the dispute reason. | Allowed (either person may edit the reason and status). The opponent cannot be changed. |
| 18 | Nina: look for a **Delete** button on the dispute. | There is none. Only Maya (the creator) has it. |
| 19 | Maya: **Delete** the dispute. | Confirmation, then it disappears. |
| 20 | Reload while signed in; close the tab and reopen. | Stays signed in on reload; signed out after reopening (by design). |

Extra checks with a tool such as Postman or curl (through http://127.0.0.1:8081 with a bearer token):

| Call | Expected |
|---|---|
| `POST /api/arguments` by Carl on Maya's dispute | 403 |
| `POST /api/arguments` with `dispute_id` `999` or `abc` | 404 / 400 |
| `POST /api/arguments/{id}/submit-ai` with the wrong `people` | 400 "people must be N for your role" |
| `GET http://127.0.0.1:3000/api/beefs` without a token | 401 |

## 3. Verify the databases (for the video)

| Database | Service | How to look |
|---|---|---|
| PostgreSQL (RDBMS) | evidence service: users, arguments | `docker compose exec postgres psql -U evidence -d evidence_db -c "select argument_id, dispute_id, person_id, status, version from arguments;"` |
| MongoDB (NoSQL) | AI service: sessions, resolutions | `docker compose exec mongo mongosh ai_resolution_db --eval "db.resolutions.find().toArray()"` |
| SQLite (RDBMS) | beef CRUD: disputes | `docker compose exec beef-crud-service sqlite3 /data/beef-resolver.db "select id, person_a, person_b, person_a_id, person_b_id, status from beefs;"` |

Message broker: RabbitMQ at http://127.0.0.1:8080, queues `ai.resolution.work.0` and `.1`.

## 4. Known limits (not bugs)

- The AI result needs **both** sides submitted. With one side the status stays `waiting_for_other_person`.
- The side is automatic: the creator is side 1 and the opponent is side 2.
- The opponent is chosen from registered users by display name (at least 2 letters, so a one-letter name such as "B" cannot be found). People with the same name show a short id (#xxxx) to tell them apart.
- Being picked as the opponent gives access immediately; there is no invitation to accept.
- Disputes created before this change (name-only rows) are hidden and cannot take arguments.
- Accepting or rejecting the AI suggestion, public polls and betting are not built.
- Evidence is a URL, not a file upload.
- There is no TLS; this is for local use only.
