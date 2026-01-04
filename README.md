# VoxaReflect

VoxaReflect is a guided reflection coach that pairs a Flask backend with a React client. The backend orchestrates Gibbs-phase conversations with OpenAI models, stores transcripts in `Backend/conversations.json`, performs voice transcription and text-to-speech, and serves the production React build. The frontend provides the tutoring UI, audio capture, and coaching timeline for students.

## Repository layout

- `Backend/` – Flask API (`app.py`), OpenAI orchestration (`chatomatic.py`), prompt templates, and persistence assets.
- `Frontend/` – React client started with `npm start` during development or bundled with `npm run build` for Flask to serve.
- `.env-template` – reference for every environment variable the backend and helper script load.
- `run_voxareflect.bat` – Windows helper that wires the env file, bootstraps dependencies, and starts backend + frontend terminals.
- `system_structure.md` – deeper architecture reference used by tooling.

## Requirements

- Python 3.10+ with the ability to install `torch` / `sentence-transformers` wheels.
- Node.js 18+ and npm (or yarn) for the React client.
- An OpenAI API key with access to the listed GPT, Whisper, and TTS models.
- (Optional) ngrok or another HTTPS tunnel if remote testers need microphone access.

## Setup

1. **Clone the repo** and open it in your terminal of choice.
2. **Create your env file.** Copy `.env-template` to `.env` in the repo root and fill in the placeholders:
   ```powershell
   copy .env-template .env
   ```
   At minimum set `OPENAI_API_KEY`. Adjust any `VOXAREFLECT_*` or `OPENAI_TTS_*` knobs you plan to use.
3. **(Windows) Prefer the helper script.** If you can run `.bat` files, you may skip the manual dependency steps below—`run_voxareflect.bat` creates the virtual environment, installs backend requirements, ensures frontend dependencies exist, and launches both servers. Keep steps 4–6 handy if you need to set things up manually (e.g., on macOS/Linux).
4. **Install backend dependencies.**
   ```powershell
   cd Backend
   python -m venv .venv
   .\.venv\Scripts\activate
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
5. **Install frontend dependencies.**
   ```powershell
   cd ..\Frontend
   npm install
   ```
6. **Ensure data files exist.** `Backend/conversations.json` must be a valid JSON object (an empty `{}` works). The server will create user conversations inside that file.

## Running the app

### Windows quick start

1. Ensure `.env` contains the values you need (e.g., `VOXAREFLECT_FRONTEND_API_BASE=http://localhost:5001/`).
2. Double-click `run_voxareflect.bat` or run it from PowerShell:
   ```powershell
   .\run_voxareflect.bat
   ```
   The script creates/updates the backend virtualenv, installs backend requirements, ensures frontend deps are installed, and launches two terminals (Flask on port `5001`, React dev server on `3000`). It also opens the URL specified by `VOXAREFLECT_FRONTEND_ENTRY_URL`.

### Manual start (all platforms)

Terminal 1 – backend:
```bash
cd Backend
source .venv/bin/activate  # Windows: .\.venv\Scripts\activate
python app.py
```

Terminal 2 – frontend:
```bash
cd Frontend
set REACT_APP_SERVER_URL=http://localhost:5001/  # macOS/Linux: export ...
npm start
```

Visit `http://localhost:3000/?lang=en&mic=1&ava=1&group=1` (or change the query params for your cohort). Use the chat area to converse with VoxaReflect, and test microphone uploads plus synthesized replies. The Flask console logs all OpenAI calls, TTS attempts, and stored summaries.

`lang` controls the UI language for both the interface and prompts: set `lang=en` for English or `lang=de` for German. Update the `lang` query parameter anywhere you share a link (including the `VOXAREFLECT_FRONTEND_ENTRY_URL` value) to switch languages.

### Serving the production build

To serve the React bundle from Flask instead of the dev server:
```bash
cd Frontend
npm run build
```
`Backend/app.py` automatically serves `Frontend/build` as static files, so restarting the backend is enough.

## Configuration reference

Key environment variables (see `.env-template` for defaults):

- `OPENAI_API_KEY` – required. Used for GPT, Whisper, and TTS calls.
- `VOXAREFLECT_LLM_MODEL` / `VOXAREFLECT_CLASSIFIER_MODEL` – override the assistant and classifier GPT models (default `gpt-5.1`).
- `VOXAREFLECT_TTS_MODE`, `VOXAREFLECT_TTS_ENDPOINT`, `VOXAREFLECT_TTS_AUTH_TOKEN`, `VOXAREFLECT_TTS_HEADERS`, `VOXAREFLECT_TTS_FORMAT`, `VOXAREFLECT_TTS_TIMEOUT`, `VOXAREFLECT_TTS_CACHE_TTL`, `VOXAREFLECT_VOICE_JOB_TTL` – control whether TTS runs, which endpoint to call, and cache lifetimes.
- `OPENAI_TTS_MODEL`, `OPENAI_TTS_DEFAULT_VOICE`, `OPENAI_TTS_ALLOWED_VOICES`, `OPENAI_TTS_INSTRUCTION_WARM`, `OPENAI_TTS_INSTRUCTION_PROFESSIONAL` – fine-tune speech presets.
- `VOXAREFLECT_FRONTEND_API_BASE` – base URL that helper scripts and dev builds use for API calls (`http://localhost:5001/` locally).
- `VOXAREFLECT_FRONTEND_ENTRY_URL` – URL opened once both servers are running (e.g., include language/mic parameters).
- `REACT_APP_SERVER_URL` – used by `npm start`. Set to the backend origin before launching the React dev server.

Update the values in `.env`, rerun `run_voxareflect.bat`, or restart your terminals to pick up the changes.

## Data and persistence

- Conversations, summaries, and per-phase metrics are stored inside `Backend/conversations.json`. Back up this file before testing with real students.
- Whisper transcripts and generated summaries are appended to each conversation record.
- Text-to-speech audio is cached in-memory for `VOXAREFLECT_TTS_CACHE_TTL` seconds and is exposed via `/tts/audio/<id>`.

## Optional: expose the app via ngrok

1. Start the backend locally (`python app.py`).
2. Launch ngrok (or an equivalent HTTPS tunnel) on port `5001`:
   ```bash
   ngrok http 5001
   ```
3. Copy the public HTTPS URL and set `VOXAREFLECT_FRONTEND_API_BASE` plus `VOXAREFLECT_FRONTEND_ENTRY_URL` to that origin so browsers trust microphone access.
4. Rebuild the frontend if you serve it through Flask:
   ```bash
   cd Frontend
   npm run build
   ```
5. Share the ngrok URL with testers (include `lang`, `mic`, `ava`, and `group` query parameters as needed).

## Troubleshooting tips

- **Missing models or API errors:** confirm `OPENAI_API_KEY` is loaded (Flask will raise an error on startup if it is empty).
- **Mic permission errors on remote devices:** always serve the frontend over HTTPS (use ngrok) because browsers block microphone access on plain HTTP origins.
- **No conversations appear:** verify `Backend/conversations.json` is readable/writable and contains at least `{}`.
- **TTS disabled:** set `VOXAREFLECT_TTS_MODE=ai` and ensure the endpoint + auth token point to a working speech API.
