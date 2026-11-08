# AI Problem Resolution

RabbitMQ work queues + session-isolated MongoDB history and per-resolution archive + a local Ollama model.

Runtime: ASP.NET Core `SubmitArgumentForAi` -> RabbitMQ -> Python worker -> Ollama.
From repository root, run `docker compose up --build` to start all services.
Then `docker compose run --rm --build --no-deps demo-client` submits through ASP.NET Core.
`tools/test_producer.py` is optional development tooling, not a runtime service.

## Resolution language and Ollama model

The worker chooses the resolution language from the current argument statements. If all
statements are mainly Thai, all five resolution fields are written in Thai. If at least
one current statement is mainly English, all five fields are written in English.
JSON keys, evidence URLs, and older versions of edited arguments do not affect the choice.
The default model is `qwen3.5:2b`; to use another installed Ollama model, set
`OLLAMA_MODEL` in the root `.env` file and run `docker compose up -d --build`.
Existing stored resolutions are not regenerated when the model or language rule changes;
submit a new argument version to produce another AI round.

See [report.md](../report.md) for setup, examples, message contracts, design decisions,
test results, and limitations. Docker mode requires Docker only; native development
requires Python 3.9+ and Ollama.
