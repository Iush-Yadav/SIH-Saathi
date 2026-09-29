const CONFIG_URL = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';

export function createBhashiniClient(env = process.env, request = fetch) {
  const direct = !!(env.BHASHINI_INFERENCE_KEY && env.BHASHINI_INFERENCE_URL);
  const discover = !!(env.BHASHINI_USER_ID && env.BHASHINI_ULCA_API_KEY && env.BHASHINI_PIPELINE_ID);
  const cache = new Map();
  const available = (task, language) => discover || !!(direct && env[`BHASHINI_${task.toUpperCase()}_${language.toUpperCase()}`]);
  const enabled = ['hi', 'en'].some(language => available('asr', language) || available('tts', language));

  async function post(url, headers, payload) {
    const response = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`Bhashini returned HTTP ${response.status}`);
    return response.json();
  }

  async function taskConfig(task, language) {
    const explicit = env[`BHASHINI_${task.toUpperCase()}_${language.toUpperCase()}`];
    if (direct && explicit) return { serviceId: explicit, url: env.BHASHINI_INFERENCE_URL, key: env.BHASHINI_INFERENCE_KEY };
    if (!discover) throw Error('Bhashini service configuration is missing');
    const cacheKey = `${task}:${language}`;
    const old = cache.get(cacheKey);
    if (old && old.expires > Date.now()) return old.value;
    const result = await post(CONFIG_URL, { userID: env.BHASHINI_USER_ID, ulcaApiKey: env.BHASHINI_ULCA_API_KEY }, {
      pipelineTasks: [{ taskType: task, config: { language: { sourceLanguage: language } } }],
      pipelineRequestConfig: { pipelineId: env.BHASHINI_PIPELINE_ID }
    });
    const choice = result.pipelineResponseConfig?.find(item => item.taskType === task)?.config?.find(item => item.language?.sourceLanguage === language);
    const endpoint = result.pipelineInferenceAPIEndPoint;
    if (!choice?.serviceId || !endpoint?.callbackUrl || !endpoint?.inferenceApiKey?.value) throw Error(`Bhashini ${task} is unavailable for ${language}`);
    const value = { serviceId: choice.serviceId, url: endpoint.callbackUrl, key: endpoint.inferenceApiKey.value };
    cache.set(cacheKey, { value, expires: Date.now() + 30 * 60_000 });
    return value;
  }

  async function transcribe(audioContent, language) {
    const config = await taskConfig('asr', language);
    const response = await post(config.url, { Authorization: config.key }, {
      pipelineTasks: [{ taskType: 'asr', config: { language: { sourceLanguage: language }, serviceId: config.serviceId, audioFormat: 'wav', samplingRate: 16000 } }],
      inputData: { audio: [{ audioContent }] }
    });
    const transcript = response.pipelineResponse?.find(item => item.taskType === 'asr')?.output?.[0]?.source;
    if (!transcript) throw Error('Bhashini returned no transcript');
    return transcript;
  }

  async function synthesize(text, language) {
    const config = await taskConfig('tts', language);
    const response = await post(config.url, { Authorization: config.key }, {
      pipelineTasks: [{ taskType: 'tts', config: { language: { sourceLanguage: language }, serviceId: config.serviceId, gender: 'female' } }],
      inputData: { input: [{ source: text }] }
    });
    const audio = response.pipelineResponse?.find(item => item.taskType === 'tts')?.audio?.[0]?.audioContent;
    if (!audio) throw Error('Bhashini returned no audio');
    return Buffer.from(audio, 'base64');
  }

  return { enabled, available, transcribe, synthesize };
}
