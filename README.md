# Saathi — SIH26003

Tablet-first, offline-first cognitive games and memory support with a caregiver view and Hindi voice guidance.

**SIH prototype:** Built to demonstrate the idea and core flows. Small labels in the app identify areas that still need external services, device support, or real-world validation.

| Area | Prototype boundary |
| --- | --- |
| Family sync | Works across devices on one running Node server. A sharing ID grants full access; user authentication and revocation are future work. |
| AI companion | Text replies work when a reachable Qwen model service is running. A model on a laptop does not power a deployed site after that laptop is off. |
| Hindi/English voice | Browser speech is a fallback. Live Bhashini speech needs credentials and has not yet been verified. Voice quality and availability vary by device. |
| Reminders and caregiver insights | Notifications run while the app is open. Game scores are activity indicators, not a clinical assessment. |
| Assamese conversation | The interface is translated; companion chat currently supports Hindi and English. |

## Run

Requires Node.js 24 or later. No package installation is needed.

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Run the checks with `npm test`.

The server stores shared data in `saathi.sqlite` in this directory. The file is ignored by Git. For deployment, run one persistent Node server and SQLite database for all devices. Set `PORT`, `HOST`, and optionally `SAATHI_DB` (a writable persistent path), serve only over HTTPS, and back up the database. Keep the database out of any static web root. Static-only hosting cannot provide cross-device sync. A sharing ID is a 128-bit random access secret: anyone with it can read, edit, or delete that space. Share it privately; there is no password recovery or identity verification in this prototype.

## Demo

1. Open **Games** and play each of the four domains. Each session has three untimed rounds.
2. Open **Caregiver** to see per-domain activity and add a reminder.
3. Open **Settings** to see your unique sharing ID. Tap **Enable ID sharing** to save this space online.
4. On another device using the same deployed server, enter that ID under **Join an existing shared space**. Both devices can edit the same profile, reminders, games and conversation history. Updates are checked about every 15 seconds while the page is open. The older code-and-passphrase flow remains available for existing spaces.
5. From the family account, create a one-use care-team invite. Enter it on a health worker's device to open the read-only dashboard.
6. After the first load, disconnect the network and reload. Games, reminders and local activity remain available; syncing resumes when online.

The selected language applies to navigation, games, forms, dashboard, dates, feedback, notifications, and spoken guidance. English speech uses a device voice. The main Hindi game prompts and default reminder phrases also ship as offline audio, so the Hindi voice test works without an installed Hindi voice. Custom reminder titles need a system voice for speech. Hindi and English commands use the browser's recognition API when available and may need a connection. All essential actions have touch controls. Family members can add optional translations for custom reminder titles; user-written text is otherwise shown as entered.

See [SIH26003_PLAN.md](./SIH26003_PLAN.md) for the problem mapping, architecture, pitch, and real-world validation requirements.

## Hindi and English conversation companion

The highlighted **Talk to Saathi** section opens a private chat in the chosen site language. The interface offers text, microphone input, spoken replies, and an optional checkbox to share the day's reminders with the model. Chat turns are stored on this device and, when ID sharing is enabled, in the shared family database so trusted devices see the same conversation. The chat view shows turns in the selected language; switching language does not erase the other language’s turns. Clearing chat removes earlier turns across synced devices.

The companion uses the open-source Qwen3 4B model through a llama.cpp compatible HTTP service. On a local Mac with `llama-server` installed, run these in separate terminals:

```sh
llama-server -hf Qwen/Qwen3-4B-GGUF:Q4_K_M --host 127.0.0.1 --port 8080 -c 4096 -ngl 99 --no-webui
npm start
```

The model download happens on first launch. Saathi checks `/health` and sends chat requests to `/v1/chat/completions`. If the model is unavailable, chat shows a clear error and preserves the unsent message; it does not invent a canned AI answer. Qwen3 is an open model, but a production inference server still needs compute and hosting. Bhashini is optional for speech and is not required for text replies.

**Deployment:** a model running on your laptop cannot serve a public deployment once the laptop is off. Deploy the Node app and a persistent model service on the same server, or point the Node app at a separately hosted llama.cpp compatible endpoint. Configure `LLAMA_URL` (for example `http://127.0.0.1:8080` for a colocated model or your private inference URL), `LLAMA_MODEL` (the model ID accepted by that endpoint), and optional `LLAMA_API_KEY` in the **server environment**. Do not put the key in browser code. Keep the model endpoint private or require authentication. A static-only host cannot run this app's Node API, SQLite sync, or AI service. Free local inference is possible on hardware you control; a permanently available public site needs an always-on host and may incur hosting costs.

Bhashini handles speech, not conversation reasoning. Keep all Bhashini credentials on the server. For pipeline discovery, set `BHASHINI_USER_ID`, `BHASHINI_ULCA_API_KEY`, and `BHASHINI_PIPELINE_ID` in the server environment. Alternatively set `BHASHINI_INFERENCE_URL`, `BHASHINI_INFERENCE_KEY`, and language-specific service IDs (`BHASHINI_ASR_HI`, `BHASHINI_TTS_HI`, `BHASHINI_ASR_EN`, `BHASHINI_TTS_EN`). Mic recordings are sent as 16 kHz WAV to the server and from there to Bhashini only when voice input is used. When Bhashini TTS is connected, generated reply text is sent there for automatic spoken playback after each answer or when the user taps Hear reply. If Bhashini is not configured, the app tries browser speech recognition and device speech synthesis where available. Voice availability varies by browser and installed system voices. The Bhashini integration is adapter-tested with mock responses; live Bhashini speech remains unverified until credentials are supplied.

Saathi identifies itself as AI, avoids medical advice, and directs urgent situations to trusted people and emergency services. It is a companionship prototype, not a clinical or crisis service.

## GitHub and deployment notes

The repository contains source code and bundled demo audio. Local SQLite files, environment files, logs, and `node_modules` are ignored. Do not commit API keys, real family data, chat exports, or downloaded model weights. No Git remote is configured yet; create a GitHub repository, then add its remote and push the source when ready. GitHub Pages can show static assets, but it cannot run this app's Node API, family sync, or Qwen inference. Deploy the full Node service with persistent storage and a reachable model service for an online demo.
