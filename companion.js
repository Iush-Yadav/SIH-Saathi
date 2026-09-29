import { companionPrompt, cleanHistory, urgentFallReply } from './companion-core.js';

const unavailable = message => Object.assign(new Error(message), { status: 503 });

export function createCompanionService(env = process.env, request = fetch) {
  const base = (env.LLAMA_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
  const model = env.LLAMA_MODEL || 'Qwen3 4B';
  const headers = { 'Content-Type': 'application/json' };
  if (env.LLAMA_API_KEY) headers.Authorization = `Bearer ${env.LLAMA_API_KEY}`;

  async function available() {
    try {
      const response = await request(`${base}/health`, { headers, signal: AbortSignal.timeout(3000) });
      return response.ok && (await response.json()).status === 'ok';
    } catch { return false; }
  }

  async function reply(message, language, history = [], reminders = []) {
    const urgent = urgentFallReply(message, language);
    if (urgent) return { text: urgent, mode: 'safety' };
    const safeReminders = (Array.isArray(reminders) ? reminders : []).slice(0, 8).map(r => ({
      title: String(r?.title || '').slice(0, 80), time: String(r?.time || '').slice(0, 5)
    })).filter(r => r.title);
    let response;
    try {
      response = await request(`${base}/v1/chat/completions`, {
        method: 'POST', headers, signal: AbortSignal.timeout(90000),
        body: JSON.stringify({ model, stream: false, temperature: 0.6, top_p: 0.95, max_tokens: 512,
          messages: [{ role: 'system', content: companionPrompt(language, safeReminders) }, ...cleanHistory(history), { role: 'user', content: message }] })
      });
    } catch { throw unavailable('AI service is unavailable. Check the model server and try again.'); }
    if (!response.ok) throw unavailable('AI service could not answer. Please try again.');
    const data = await response.json();
    const text = String(data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 1200);
    if (!text) throw unavailable('AI service gave an empty answer. Please try again.');
    return { text, mode: 'model' };
  }

  return { model, available, reply };
}
