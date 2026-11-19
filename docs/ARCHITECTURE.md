# Architecture

React reads authenticated account data through the same-origin `/api` proxy.
PostgreSQL is authoritative for notebooks, grammar, reviews, history, profile and preferences.
No shared bearer-token fallback is available. Passwords use Argon2id; random session cookies
are HttpOnly/SameSite=Lax and only their SHA-256 digests are stored in PostgreSQL.
Unsafe browser requests require a custom header and matching Origin when supplied.
Production HTTPS must enable SESSION_COOKIE_SECURE.

User ownership is checked on every notebook/grammar/history/preferences operation.
A locally executed command can claim the existing development owner without changing its ID.
Public registrations never claim legacy data. Owner-only legacy browser recovery is automatic
and one-time; it does not overwrite existing server reviews.

A practice event and review counters commit in one transaction. `(user_id, attempt_id)` is
unique; replaying the same answer returns its saved result, while reusing the ID for another
answer is a conflict. Parent-row locks serialize review writes in PostgreSQL.
Preferences use a revision and per-user row lock to detect stale multi-device updates.
History is cursor-paginated; dashboard totals are aggregated across all events.

Email delivery, production deployment, pronunciation assessment and push scheduling
are intentionally not part of this change. No offline write queue is enabled.


Tutor and conversation histories live in user-scoped chat_turns (migration 006).
The last 12 turns and up to 25 personal notebook entries ground each AI request.
Voice messages go directly to Gemini with owner-scoped history and notebook context.
One response contains the transcript plus a natural assistant answer. Raw audio is not
saved in the database; transcript and answer persist in user-owned chat history.
Recordings stop after 60 seconds; uploads are limited to 6 MB (8 MB base64).
Direct microphone recording needs localhost or trusted HTTPS; HTTP LAN users can upload audio.
Assistant playback/auto-play controls have been removed. Notebook pronunciation playback
is independent and unchanged. The chat UI supports natural Markdown text, recording,
cancel, optional audio preview, one-step send and error recovery.

Word/reverse sessions shuffle personal notebook words and phrases. Generated items
never enter this pool. Sentence/grammar sessions generate in batches of at most five
on every start, exclude the latest 100 generated texts, validate and save the whole
session before displaying it. No daily/level gate and no silent old-question fallback.
