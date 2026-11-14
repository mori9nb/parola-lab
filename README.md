# Parola Lab

An open-source personal language notebook and daily practice app. First learning pack: Persian → Italian. **v0.1.0 is the first vertical slice, not the full AI product.**

## Available now
- Responsive RTL React interface with notebook create/search/filter/delete.
- Four-option vocabulary, phrase and sentence practice in both directions.
- Curated Italian grammar exercises with Persian explanations.
- Per-item review counters and simple spaced review scheduling (not FSRS).
- Local progress, daily target, browser speech synthesis and JSON backup/import.

The hosted preview stores data **only in the current browser**. Clearing site data removes it. Export a backup before changing device. The preview does not call an AI provider or the Python API. Italian speech synthesis depends on the device's available voices.

## Development
```sh
npm ci
npm run dev
npm test
npm run build
```

## Docker / backend foundation
```sh
cp .env.example .env
# Replace both placeholder values locally; never commit .env.
docker compose up --build
```
Web: http://localhost:8080 · API docs: http://localhost:8000/docs.

The FastAPI API has notebook CRUD, authenticated capability reporting and review scheduling. All `/api/*` endpoints require `Authorization: Bearer <API_TOKEN>`. It is a **single-owner development API**, not public multi-user authentication. Docker binds exposed ports to loopback. Alembic migrations run before API startup; PostgreSQL uses a named volume.

**The UI still uses localStorage even under Docker.** Server synchronization and user accounts are the next milestone; the proxy alone does not connect the UI to PostgreSQL. API persistence and the frontend preview are independently usable foundations.

Backend checks:
```sh
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest tests -q
```

## Repository
- `src/`: React UI and framework-independent learning functions.
- `backend/app/`: initial FastAPI service and relational models.
- `backend/migrations/`: versioned database schema.
- `tests/`, `backend/tests/`: quiz and API behavior checks.
- `docs/`: architecture, decisions, milestones and evaluation plan.
- `.github/workflows/ci.yml`: tests, production build and container builds.

## Planned, not active
Multi-user authentication; frontend ↔ server sync; LLM provider adapters; schema-validated exercise generation; chat tool calls; speech transcription and correction; Web Push scheduling; broader language packs; model evaluations and optional fine-tuning. UI labels explicitly identify unavailable features.

The initial Italian content is illustrative; generated content will need validation. CEFR labels are content tags, not a certified level assessment. Current settings do not filter the curated exercises by CEFR.

## Contributing
Use small task branches and focused commits. Include tests for changes to scheduling, correctness, ownership and storage. Open a PR describing the resulting behavior and validation. Do not add user transcripts, recordings, keys or third-party copyrighted textbooks to the repository.

## License
Apache-2.0; see LICENSE. Model weights and imported content keep their own licenses. No third-party model weights are bundled.
