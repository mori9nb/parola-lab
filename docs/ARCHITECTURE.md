# Architecture decisions

## ADR-001: modular monolith, staged extraction

Target architecture: one Python backend, modules for identity, content, practice, review, AI, speech and notifications. Web and database are separate processes; module boundaries are not microservices. The initial API lives in one small module and will be split when server synchronization is added. React frontend is a static PWA shell.

## ADR-002: persistence

PostgreSQL is the server source of truth after identity and synchronization land. Version 0.1 uses localStorage in the preview with JSON backups. API uses SQLAlchemy/Alembic. The first schema is intentionally single-owner. Ownership columns, session auth and isolation tests are prerequisites for multi-user release. Do not expose the development token in frontend bundles.

## ADR-003: AI is an adapter, not the database

Future interfaces: generate_exercise, explain, evaluate_answer, transcribe. Retrieve authorized content in application code, send bounded context to the provider, validate responses with Pydantic and store provenance/model/prompt versions. No arbitrary model SQL. Tool calls use allowlisted application operations and idempotency keys. Initial providers: configurable hosted adapter, optional local open-weight model. No fine-tuning required for personal vocabulary.

## ADR-004: learning domains

Language-neutral content fields carry source and target identifiers. Italian-specific explanations are a first pack. Programming/assembly learning needs a separate validator, safely sandboxed runner and domain-specific levels, not a CEFR label applied to code.

## ADR-005: reminders

Real Web Push needs subscriptions, permission, service worker, server secrets, timezone-aware scheduling, deduplication and delivery status. No setInterval imitation of background notifications. Current worker does not implement notifications or offline caching.

## ADR-006: licensing

Project source and original seed content: Apache-2.0. External models and imported datasets retain separate licenses and attribution. The project does not grant rights over user-submitted material.
