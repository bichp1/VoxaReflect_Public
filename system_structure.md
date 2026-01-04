VoxaReflect/
- `.env` – Root environment file loaded on boot to supply OpenAI keys, model overrides, and TTS config.
- `run_voxareflect.bat` – Convenience launcher that activates the venv and starts backend/frontend.
- `README.md` – Step‑by‑step setup, configuration, and troubleshooting notes for local development.
- `Backend/`
  - `app.py` – Flask API server: handles chat turns, phase advancement, storage, titles/feedback, audio uploads, and text‑to‑speech streaming.
  - `chatomatic.py` – Encapsulates the two‑call OpenAI flow (phase classifier + assistant reply) and final summary generation.
  - `reflection_system_prompt.py` – Central Gibbs‑cycle prompt template plus per‑phase metadata (goals, depth cues, turn caps).
  - `qa_database.py` – Legacy helper for FAQ similarity lookups.
  - `conversations.json` – Persistent log of every conversation’s metadata, message history, and phase turn counters.
  - `requirements.txt` – Python dependencies for the backend/worker processes.
  - `*.json`, `*.ipynb` – Sample data, translation utilities, and exploratory notebooks used during content creation.
  - `.venv/` – Local virtual environment pinned by `requirements.lock` with all installed packages.
- `Frontend/`
  - React client (source + build) that renders the tutoring UI, calls the Flask endpoints, and plays TTS audio.
- `.env`
  - Houses knobs such as `VOXAREFLECT_LLM_MODEL`, `VOXAREFLECT_CLASSIFIER_MODEL`, `VOXAREFLECT_TTS_MODE`, `VOXAREFLECT_TTS_ENDPOINT`, `OPENAI_TTS_MODEL`, and API keys. `load_dotenv()` in `Backend/app.py` loads it automatically, so changing models or TTS backends is a matter of editing this file.

System flow overview:

1. The frontend posts `/newChat` with the student’s reply, style preset, language, and optional voice preference.
2. `Backend/app.py` loads the user’s conversation (from `conversations.json`), builds a reflection context (current phase, turn counts, style), and forwards the turn to `chatomatic.Chatomatic`.
3. `chatomatic` first runs a phase-classification call (`VOXAREFLECT_CLASSIFIER_MODEL`, default `gpt-5.1`) using the latest three turns to decide `stay` vs `advance`. It then builds a system prompt via `reflection_system_prompt.py`, appends up to six recent turns, and calls the main LLM (`VOXAREFLECT_LLM_MODEL`, default `gpt-5.1`) to craft the coach reply. When the cycle finishes, it triggers a final summary call.
4. `app.py` updates the conversation entry, saves the new phase/turn counts, optionally generates TTS via `synthesize_speech()` (default `gpt-4o-mini-tts` endpoint), and returns the assistant reply + metadata to the UI.
5. Conversations, summaries, and phase metrics persist in `Backend/conversations.json`, so restarting the server resumes the exact Gibbs-phase state and turn budget for every user.

Additional endpoints (`/getConversations`, `/addChatToConversation`, `/determineFeedbackAndTitle`, `/createNewTitle`, `/uploadAudio`, `/tts/audio/<id>`) provide listing, manual feedback, title generation, Whisper transcription (`whisper-1`), and cached audio streaming hooks for the frontend.

Implementation details useful for AI consumers:

- `Backend/chatomatic.py` strictly separates the phase decision and coach reply into two OpenAI Responses API calls (both temperature 1.0). The classifier prompt references `PHASE_DEFINITIONS` goals and `turn_target`, while the generation prompt includes the student’s accumulated essay and up to six recent exchanges.
- Turn caps are enforced by `PHASE_TURN_CAPS` (derived from `reflection_system_prompt.py`). Each conversation stores `phaseTurns` and `currentPhaseTurns`, so the server can resume the correct Gibbs phase even after restarts.
- `reflection_system_prompt.py` defines the Gibbs phase descriptions, style preset language, and the structured instructions used by the LLM. Mentioning this file helps external tools understand why the assistant behaves differently per phase.
- Text-to-speech runs only when `VOXAREFLECT_TTS_MODE` and `VOXAREFLECT_TTS_ENDPOINT` are configured; `get_tts_style_config()` limits voices to a curated allowlist to keep delivery consistent.
