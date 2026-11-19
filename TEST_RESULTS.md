# Verification — Parola 0.2 pre-deployment bundle

## Executed

- Backend: **75 passed, 3 skipped** (`python -m pytest tests -q`).
- Frontend: **45 passed** (`npm test`), including React account-flow tests.
- Full Vite production build: **passed** (`npm run build`).
- PostgreSQL 16.2: generated SQL for migrations 001–005 was executed in PostgreSQL's
  stand-alone backend. A notebook record inserted before migration 005 remained present,
  and Alembic revision 005 plus the new tables were verified. Migration 006 was then
  applied in the same PostgreSQL stand-alone database: revision 006, chat_turns and
  the preserved notebook row were verified.

## Coverage added

- Real registration/login/logout, session expiry, opaque session-cookie storage,
  password hashing, password change and local reset.
- Revocation of another device's sessions after changing a password.
- Rejection of obsolete shared development bearer tokens.
- Same-origin/custom-header request protection and authentication attempt limits.
- Local owner-account setup preserving existing owner/data IDs.
- Separation of notebook, grammar, history and preferences between real accounts.
- Atomic history/review writes and duplicate-attempt replay behavior.
- Settings revision conflicts and timezone validation.
- Owner-only one-time legacy recovery and history deduplication.
- React sign-in/expiry flow, automatic loading, server-backed profile changes,
  server-backed history, and error handling without local fallback.

## Not executed here

The three optional `TEST_POSTGRES_URL` tests require a normal networked PostgreSQL
instance. They cover live migrations and concurrent review/settings transactions.
Local server sockets are unavailable in this execution environment, so those tests were
skipped here. A PostgreSQL 16 CI job is included to execute them.

Container builds, a live browser against the user's WSL database, and physical tablet
network behavior were not run here. Those are the next local acceptance checks;
no deployment was attempted.

AI responses are mocked in automated tests; the existing user's Gemini configuration
must remain in backend/.env for live AI use. Email verification and email-based password
recovery are not implemented; a local password-reset command is provided for this test build.

Dependency deprecation warnings remain in Starlette's test client, SQLite's datetime
adapter and react-test-renderer. They did not fail the checks.


## Practice/chat/voice update

- React integration verifies word sessions send no generation requests, and sentence/
  grammar sessions generate again at the same level, excluding earlier texts.
- Chat tests verify authentication, owner-only history/notebook grounding, independent
  channels, persistence/clearing and rejection of invalid model responses.
- Audio tests verify authenticated input validation, native Gemini audio payload and
  transcript parsing. A mocked browser microphone exercises recording and direct
  voice sending in a single Gemini request, without a separate transcription step.
  The messenger regression test verifies assistant playback controls are absent.
- Actual Gemini calls, real microphone permissions/codecs, tablet HTTP/HTTPS behavior still require the user's device acceptance test. No
  live-call or pronunciation-scoring service was implemented.

The local headless Chromium visual check could not launch because this execution
environment blocks browser socket creation. The production build and React interaction
tests pass; visual/device acceptance remains to be checked on the user’s machine.
