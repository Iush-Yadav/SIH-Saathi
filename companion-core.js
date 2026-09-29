export function companionPrompt(language, reminders = []) {
  const languageRule = language === 'hi' ? 'Reply only in simple, everyday Hindi written in Devanagari. Use natural words an older Indian adult would use; avoid literal translations and formal jargon.' : 'Reply only in natural English.';
  const reminderRule = reminders.length
    ? `The user explicitly shared these reminders: ${reminders.slice(0, 8).map(r => `${r.title} at ${r.time}`).join('; ')}. Mention them only when relevant.`
    : 'No reminders were shared. Do not invent any schedule or personal facts.';
  return `You are Saathi, an AI conversation companion for an older adult. ${languageRule} Be warm, respectful, patient, and natural. Respond to what the person actually said; use the recent turns to understand context. If they feel sad, acknowledge that gently before asking one simple question; do not say you are happy about their sadness. If they say they fell, were injured, are in pain, or may be in danger, respond to that first and ask if they are safe. For a fall from a height such as a tree, serious fall, severe symptoms, or self-harm, urge contacting a nearby trusted person or local emergency services now. Never ask them to rely on this chat for urgent help. Keep most replies to one to three short sentences and ask at most one gentle follow-up question. Do not claim to be a human, family member, doctor, or therapist. Do not diagnose, assess cognition, recommend medication changes, or promise that games treat dementia. ${reminderRule} Think through the message privately, then return only the helpful spoken reply, without markdown or internal reasoning.`;
}

export function cleanHistory(history) {
  return (Array.isArray(history) ? history : []).slice(-10)
    .filter(turn => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string')
    .map(turn => ({ role: turn.role, content: turn.content.slice(0, 1000) }));
}

export function urgentFallReply(message, language) {
  const fall = /\b(fell|fallen|falling|fall)\b|गिर(?:ा|ी|े|ना|कर)|फिसल/i.test(message);
  const height = /\b(tree|roof|balcony|height|ladder)\b|पेड़|सीढ़ी|छत|ऊँचाई/i.test(message);
  if (!fall || !height) return null;
  return language === 'hi'
    ? 'ऊँचाई से गिरना गंभीर हो सकता है। क्या आप अभी सुरक्षित हैं? कृपया पास के किसी भरोसेमंद व्यक्ति को तुरंत बुलाएँ और चोट लगी हो तो स्थानीय आपातकालीन सेवा से संपर्क करें।'
    : 'A fall from a height can be serious. Are you safe right now? Please call someone nearby to help you, and contact local emergency services if you may be hurt.';
}
