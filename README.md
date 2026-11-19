# Parola Lab 0.2 — pre-deployment test build

An Italian learning notebook for Persian-speaking learners, with AI analysis/generation,
user-owned PostgreSQL notebooks and grammar banks, persistent review history and account settings.

Read [INSTALL_FA.md](INSTALL_FA.md) for the update and first-owner account setup.
No deployment is performed by this update.

## Local development

Keep your existing `backend/.env`. Install frontend and backend dependencies, run
`alembic upgrade head` from `backend`, then run `python -m app.manage create-owner`
once to secure the existing development owner's data with real credentials.
New public registrations always create separate, empty accounts.

From the project root, `python scripts/dev.py --port 5173` runs API and Vite together.
The API uses HttpOnly cookie sessions; development bearer tokens no longer authorize requests.

## Verification

- `npm test` runs learning, repository, account transport and React component checks.
- `npm run build` builds the complete frontend.
- From `backend`: `python -m pytest tests -q`.
- Set `TEST_POSTGRES_URL` to enable real PostgreSQL migration and concurrent-write checks.
  CI supplies an isolated PostgreSQL 16 database for these checks.

Migration 005 adds credentials, sessions, account preferences and practice history while
preserving existing owner IDs, notebooks, grammar questions and review counters.
Reviews and their history entry commit atomically; per-user attempt IDs prevent replayed
requests from incrementing counters twice.

This remains a pre-deployment test build. HTTPS/Secure-cookie production configuration,
email verification and email-based recovery are not deployed here. Local password reset
is available via `python -m app.manage reset-password`.
Tutor chat and Italian conversation now use Gemini with user-owned server history.
The messenger composer supports text and direct voice messages (localhost/HTTPS recording
or audio attachment). Voice is sent to Gemini with the conversation context in one request;
Gemini responds naturally and supplies a transcript for the saved user bubble. No separate
transcription step or assistant speech-synthesis playback controls. This is turn-based chat,
not a live call or pronunciation scoring. Push notifications remain unimplemented.

Word/phrase practice randomly reviews personal notebook entries, without generation.
Sentence and grammar practice generate fresh notebook-based questions on every session;
level controls difficulty only. See `PRACTICE_CHAT_UPDATE_FA.md` for installation.
