# Video script (under 5 minutes): Service Discovery and Non-functional Requirements

Total about 4:50. Run the commands in Git Bash from the repo root. Put the repo on the branch that has Kong (`git switch kong-gateway`).
Kong addresses below use `127.0.0.1`. If your Kong is published on the Wi-Fi address (see `docs/kong-demo.md`), use that address instead.

## Prepare before you press record

```bash
docker compose up -d --build        # first time: wait for the Ollama model download
docker compose ps                   # kong must show "healthy"
```

1. Register two users in the web app (http://127.0.0.1:8081), for example Maya and Nina, create one dispute between them and keep it open in a browser tab.
2. Open the RabbitMQ page (http://127.0.0.1:8080, user `ai`, password `ai-local-only`) on the Queues tab in a second tab.
3. Open Kong Manager (http://127.0.0.1:8002) in a third tab.
4. Keep a second terminal ready for the stop and start commands.

| Time | Part |
| --- | --- |
| 0:00 to 0:20 | Introduction |
| 0:20 to 1:55 | Service discovery |
| 1:55 to 2:50 | NFR 1: availability |
| 2:50 to 3:25 | NFR 2: reliability |
| 3:25 to 3:50 | NFR 3: security |
| 3:50 to 4:25 | NFR 4: scalability and performance |
| 4:25 to 4:50 | Wrap-up |

## 0:00 to 0:20 Introduction

Show the architecture diagram (Figure 1 in the proposal).

Say: "Me don't wrong has three services: a Dispute Service in Node.js, an Evidence Service in .NET and an AI service in Python. They talk through REST, gRPC and RabbitMQ. In this clip I show how they find each other, and how the system handles the non-functional requirements."

## 0:20 to 1:55 Service discovery

**A. Services are found by name (about 35 s)**

```bash
docker compose ps
docker compose exec web-gateway node -e "require('dns').lookup('evidence-service',(e,a)=>console.log('evidence-service ->',a))"
docker compose config | grep -E "BEEF_API_URL|GRPC_HOST|AI_API_URL"
```

Say: "Every service has a name on the Docker Compose network. Docker's DNS turns the name into the container address. The code uses names such as evidence-service:50051 and beef-crud-service:3000, set through environment variables, so no IP address is written in the code."

**B. Kong is the single entry point for API clients (about 35 s)**

Show `kong/kong.yml`, then Kong Manager, Gateway Services and Routes.

```bash
curl -i http://127.0.0.1:8000/api/beefs        # 401 and a "Via: kong" header
curl http://127.0.0.1:8000/ai/health
grpcurl -plaintext -import-path EvidenceAndArgumentSubmission/proto -proto evidence_argument.proto \
  -d '{"email":"prof@example.com","password":"Passw0rd!Demo1","display_name":"Prof Demo"}' \
  127.0.0.1:9080 humanresolve.argument.v1.AuthenticationService/Register
```

Say: "Kong is configured in one file. It routes /api/beefs to the Dispute Service, the two gRPC services to the Evidence Service and /ai to the AI Result API. A client only needs to know Kong's address. The 401 shows the call reached the service through Kong and was refused because it had no token."

(`Register` answers `AlreadyExists` if you reuse the email. Change the email for each take.)

**C. A restarted service is still found (about 25 s)**

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker compose ps -q beef-crud-service)
docker compose up -d --force-recreate --no-deps beef-crud-service
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker compose ps -q beef-crud-service)
curl -i http://127.0.0.1:8000/api/beefs
```

Say: "I recreate the Dispute Service. Its address may change, but the name stays the same, so the call through Kong still works."

**Limits (about 10 s)** Say: "This discovery is static. Services do not register themselves, there is one instance of each, and Kong's routes are edited by hand. For more instances we would use a registry such as Consul or Kubernetes."

## 1:55 to 2:50 NFR 1: Availability (the AI keeps its work while a worker is down)

```bash
docker compose stop ai-worker-0 ai-worker-1
```

In the web app, sign in as Maya and press **Send to AI** on her argument. Show the RabbitMQ Queues tab: the message waits in `ai.resolution.work.x` (Ready is 1).

```bash
docker compose start ai-worker-0 ai-worker-1
```

Show the queue empty again.

Say: "The queues are durable and the broker confirms each message, so the work is not lost while the AI workers are down. Containers also restart automatically, and health checks make sure the databases and the broker are ready before the services start."

## 2:50 to 3:25 NFR 2: Reliability (no unchecked data when a service is down)

```bash
docker compose stop beef-crud-service
```

In the web app, try to save an argument. It fails with "dispute service is unavailable". Then:

```bash
docker compose start beef-crud-service
```

Save again and it works.

Say: "The Evidence Service must ask the Dispute Service before it saves anything. If that service is down it answers UNAVAILABLE rather than saving data it cannot check. Messages also carry the argument id and version, so a retry never creates a second AI answer."

## 3:25 to 3:50 NFR 3: Security

Show the 401 from Kong again, then open the dispute from a third account that is not part of it. The app answers "You are not a party to this dispute."

Say: "Every call needs a signed JWT, and each service checks it itself. Only the two people in a dispute can read or change it. Passwords are stored as salted hashes. What we do not have yet is TLS and encryption of stored data."

## 3:50 to 4:25 NFR 4: Scalability and performance

```bash
docker compose ps ai-worker-0 ai-worker-1
```

Show the two queues in RabbitMQ (`work.0` and `work.1`).

Say: "The AI work is split over queues by dispute id. Both sides of one dispute reach the same worker in order, and we can add more queues and workers for more disputes. We have not load tested the 500 disputes target. For performance, the request returns at once because the AI runs through the queue. The AI result itself takes longer than 5 seconds with the small local model, so that requirement is not met yet. A hosted model or a GPU would fix it."

## 4:25 to 4:50 Wrap-up

Show the NFR table at the end of the proposal.

Say: "To sum up: services find each other by name through Docker DNS and Kong gives one entry point. Availability and reliability come from RabbitMQ, health checks and restarts. Security comes from JWT. The gaps are TLS, load testing and the 5 second AI target."

## Notes

- The commands were written from `docker-compose.yml`, `kong/kong.yml` and `docs/kong-demo.md` and have not been run end to end on the full stack. Rehearse once and adjust the timing.
- If Ollama is slow, the AI result will not appear during the clip. That does not matter for these demos, because the points are the queue, the failure handling and the security checks.
