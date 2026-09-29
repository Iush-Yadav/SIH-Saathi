# Saathi: SIH26003 submission plan

**Problem statement:** AI-Based Cognitive Gaming and Memory Assistance Platform for Elderly Dementia Patients in North Eastern Region (NER). Working brief: [SIH Buddy SIH26003](https://www.sihbuddy.in/ps/SIH26003). Confirm final wording on the official SIH portal before submission. This project is a supportive activity and reminder product, not a diagnostic or therapeutic device.

## Product thesis

An older person gets a calm, familiar tablet experience with no timer and no punishment for mistakes. Four short games adjust difficulty based on recent performance. Everyday reminders can be read in Hindi and marked complete. A family caregiver sees activity trends and manages reminders. The app works locally without connectivity; a family account syncs when online.

**Winning demo moment:** A judge plays a three-round memory game, sees gentle feedback and an adaptive next level, then opens the caregiver view to see the domain score and reminder status. A second device connects with a family code and shows the same information. A historical sample activity button displays a clearly labelled fictional chart and alert; its synthetic scores remain local and are excluded from real history and change alerts.

## Requirements mapped to the current build

| Statement need | Current implementation | Proof to show |
| --- | --- | --- |
| Memory | Remember familiar objects in a basket | Play and choose an object shown earlier |
| Attention/concentration | Select every instance of a target in a grid | Show target selection and feedback |
| Daily routine recall | Order three ordinary daily steps | Put the steps in sequence |
| Pattern/object recognition | Complete an object pattern | Select the next object |
| Adaptive difficulty | Three levels based on recent scores by domain | Replay two sessions; observe level change |
| Memory assistance | Medicine, hydration, activity and appointment reminders | Add one, mark done, see caregiver view |
| Language-aware voice | Device speech synthesis in the selected language, bundled offline Hindi prompts for the main game/reminder flow, browser speech recognition for simple Hindi and English commands when supported | Switch Hindi/English, test voice, and say “याददाश्त खेल” or “memory game” |
| Multilingual | English, Hindi and Assamese UI, with Assamese game object labels | Switch languages in header |
| Offline | Service worker caches app assets; browser local storage preserves sessions and reminders | Turn off connectivity after first load, reload, play game |
| Caregiver and health worker analytics | Per-domain recent scores, recent session log, activity chart and cautious six-day trend flag; one-use, read-only health-worker invite | Complete sessions, inspect dashboard, and open a care-team view |
| Family sync | Family code, passphrase, authenticated API and SQLite storage | Connect a second device, sync and reload |

**Localization scope:** English, Hindi and Assamese interfaces are implemented. Selecting a language changes navigation, games, forms, dashboard, dates, feedback, notifications, and voice guidance. Custom reminder text appears as entered unless the caregiver supplies optional translations. Manipuri, Khasi, Mizo and other NER languages require native-speaker translation and usability review before claiming full regional coverage. Bundled Hindi audio covers the main game and default reminder prompts offline even when a device has no Hindi system voice. Custom reminder titles require a system voice to be spoken; they remain visible as text otherwise. Browser speech recognition may use an online service; all essential actions remain available through touch and text when recognition is unavailable.

## Architecture

```text
Tablet / phone browser
  ├─ Patient day: games, reminders, Hindi voice guide
  ├─ Caregiver: trends, reminder management
  ├─ Local storage: profile, scores, reminders, completion
  └─ Service worker: offline application assets
                 │ optional online sync
                 ▼
Node HTTP API (same origin)
  ├─ Family creation + passphrase verification
  ├─ One-use, seven-day read-only care-team invite
  ├─ 30-day role-scoped bearer session
  ├─ Merge sessions/reminder edits/completions
  └─ SQLite: family records and session hashes
```

**Frontend:** dependency-free HTML, CSS and JavaScript. Bundled Hindi WAV prompts are generated from a Hindi system voice and cached by the service worker. Large touch targets, high contrast, a small number of choices, direct navigation, spoken and written prompts, no countdown timers, and feedback that does not shame mistakes. This follows the needs described by [W3C guidance for older web users](https://www.w3.org/WAI/older-users/).

**Backend:** Node 24 standard library plus built-in SQLite. Family codes are random; passphrases are salted PBKDF2 hashes; session tokens and care-team invites are stored only as hashes. The read-only role is enforced by the API, which rejects write requests. The client preserves data locally while offline, and merges immutable game sessions and timestamped reminder edits when syncing. The deployed service must use HTTPS and a private server/database volume.

**Data model:** `profile`, `sessions` (id, domain, level, score, timestamp, demo flag), `reminders` (id, category, titles, time, notes, updatedAt, deleted), `checks` (reminder/day, done, updatedAt). A deleted reminder remains as a sync tombstone so another device cannot revive it.

## Game and trend rules

- Every game has three rounds. Each domain starts at level 1. An online beta-binomial learner updates a mastery estimate from that person's non-demo results at the current level. After at least two sessions at a level, mastery of at least 0.75 raises difficulty and mastery of at most 0.45 lowers it; levels stay between 1 and 3. This is lightweight, explainable personalization, not a model of clinical condition.
- The caregiver view displays an average of the last five sessions per domain. The real activity flag requires play on at least six different days; it compares the earlier three days with the recent three and flags a drop over 20 score points. Demo sessions remain local and appear only in a separate sample scenario, where a fictional alert is explicitly labeled.
- The flag means **lower in-app activity**, not cognitive decline. Variation in attention, fatigue, device familiarity, and game difficulty can change scores. The interface directs caregivers to check in and seek professional advice if concerned; it makes no diagnostic claim.

## Visual direction

The visual language is inspired by [SIH Buddy](https://www.sihbuddy.in/): large editorial headings, thin ink borders, restrained green and warm yellow, short uppercase labels, and cards with a clear action. It is adapted for older adults with bigger type, larger buttons, clear spacing, no timed interactions, and a persistent four-item navigation bar on small screens. The app does not copy SIH Buddy branding or content.

## Submission work remaining before real-world use

1. **User research:** observe at least two older adults and two caregivers using the app. Record completion rate, mis-taps, comprehension, preferred language and voice clarity. W3C recommends involving users because automated accessibility checks cannot reveal all usability issues.
2. **Clinical review:** ask a dementia care professional to review the prompts, trend wording, and caregiver interpretation. Do not claim treatment efficacy from game scores.
3. **Regional language review:** recruit native speakers for Assamese and any added Manipuri, Khasi or Mizo content. Validate pronunciation and culturally familiar imagery.
4. **Device matrix:** test Android Chrome, iPad Safari, offline reload, installed PWA, Hindi voice availability, and reminder behavior. Browser notifications are only guaranteed while the app is open in this version.
5. **Deployment:** host the Node service behind HTTPS, persist the SQLite file on a protected volume, back it up, and publish a privacy notice and consent flow before accepting real patient data.

## SIH pitch structure

1. **Need:** An older person needs familiar activities and daily support; a caregiver needs a simple picture of engagement.
2. **Solution:** One calm tablet app with four adaptive domains, reminders, Hindi voice, offline use and caregiver synchronization.
3. **Differentiator:** Every requested component works together in the live demo. Offline-first support and a guarded caregiver trend avoid brittle connectivity and unsupported medical claims.
4. **Live walkthrough:** patient game → adaptive next level → reminder → caregiver trend → second-device sync → offline reload.
5. **Evidence:** Show user testing notes, language review, accessibility checks, and the limitations honestly.

## Sources

- [SIH Buddy SIH26003](https://www.sihbuddy.in/ps/SIH26003), independent interpretation of the problem statement.
- [W3C Older Users and Web Accessibility](https://www.w3.org/WAI/older-users/).
- [W3C Involving Users in Evaluating Web Accessibility](https://www.w3.org/WAI/test-evaluate/involving-users/).
- [WHO evidence annex on cognitive interventions](https://cdn.who.int/media/docs/default-source/mental-health/dementia/dementia_guidelines_evidence_profiles_web_annex.pdf?sfvrsn=e76ab070_3), for cautious interpretation of cognitive-training claims.

## Conversation companion extension

- **Prominent entry:** A high-contrast feature panel on the patient home view and a dedicated navigation tab.
- **Language:** The site language drives the companion's Hindi or English text, model prompt, speech recognition and speech synthesis. Switching language starts a fresh chat. Assamese site copy shows a clear Hindi/English choice until Assamese conversation is implemented.
- **Reasoning model:** Qwen3 4B GGUF through llama.cpp-compatible chat API. Backend sends the last ten turns and a short safety and language prompt. The backend accepts `LLAMA_URL`, `LLAMA_MODEL`, and optional `LLAMA_API_KEY` so production can use a separately hosted model. If the model is unavailable, the UI shows an error instead of a canned reply.
- **Voice:** Bhashini ASR accepts 16 kHz WAV; Bhashini TTS returns audio. Browser speech APIs are the fallback. Credentials stay server-side.
- **Consent and privacy:** The reminder-sharing checkbox defaults off. Conversation is stored locally and syncs to a shared space when ID sharing is enabled. The sharing ID grants full access and must be kept private. Do not portray the AI as a person, clinician or emergency service.
- **Demo status:** UI and backend are implemented, with adapter unit tests and text-chat browser checks. Live free-model conversation requires a running llama.cpp-compatible model service; live Bhashini voice requires the user's credentials.

## Shared space extension

Each device gets a random 128-bit sharing ID. The user explicitly enables online sync to create a server-side space. A trusted second device joins by entering that ID; both devices receive independent session tokens with full edit access. The backend stores profile, reminders, game sessions, completion checks and conversation turns in SQLite. Existing family code/passphrase and read-only care invites remain supported. Clients merge edits by timestamps and poll while visible. Clearing chat writes a cutoff timestamp so older turns do not return from another device. Static-only hosting is insufficient; production needs HTTPS and persistent Node/SQLite hosting. Anyone with the ID can control the space, so this is appropriate for a prototype, with stronger authentication and revocation needed before real-world deployment.
