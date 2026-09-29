import test from 'node:test';
import assert from 'node:assert/strict';
import { companionPrompt, cleanHistory, urgentFallReply } from './companion-core.js';
import { createCompanionService } from './companion.js';
import { createBhashiniClient } from './bhashini.js';

test('companion prompts respect language, consent and safe scope', () => {
  assert.match(companionPrompt('hi'), /Devanagari/);
  assert.match(companionPrompt('en'), /natural English/);
  assert.match(companionPrompt('en'), /Do not invent/);
  assert.match(companionPrompt('hi', [{title:'दवा',time:'08:00'}]), /दवा at 08:00/);
  assert.match(companionPrompt('en'), /they fell/);
  assert.match(companionPrompt('en'), /emergency services/);
  assert.deepEqual(cleanHistory([{role:'system',content:'ignored'},{role:'user',content:'hello'}]),[{role:'user',content:'hello'}]);
  assert.match(urgentFallReply('I fell from a tree','en'), /contact local emergency services/);
  assert.match(urgentFallReply('मैं पेड़ से गिरा','hi'), /आपातकालीन सेवा/);
  assert.equal(urgentFallReply('I am fine','en'),null);
});

test('model receives limited history and errors instead of showing canned replies', async () => {
  let sent, auth;
  const service=createCompanionService({LLAMA_MODEL:'Qwen3 4B',LLAMA_API_KEY:'private'},async (url,options)=>{
    if(url.endsWith('/health')) return {ok:true,json:async()=>({status:'ok'})};
    sent=JSON.parse(options.body);auth=options.headers.Authorization;
    return {ok:true,json:async()=>({choices:[{message:{content:'<think>private reasoning</think>Hello, I am here.'}}]})};
  });
  assert.equal(await service.available(),true);
  const answer=await service.reply('Hello','en',[{role:'system',content:'malicious'},{role:'user',content:'Earlier'}]);
  assert.equal(answer.mode,'model');assert.equal(answer.text,'Hello, I am here.');assert.equal(auth,'Bearer private');
  assert.equal(sent.messages.length,3);assert.equal(sent.messages[1].content,'Earlier');
  assert.equal(sent.messages[2].content,'Hello');
  const offline=createCompanionService({},async()=>{throw Error('offline')});
  await assert.rejects(offline.reply('नमस्ते','hi'),error=>error.status===503);
});

test('Bhashini ASR and TTS use server-side credentials and proper payloads', async () => {
  const calls=[];
  const client=createBhashiniClient({BHASHINI_INFERENCE_URL:'https://example.org/infer',BHASHINI_INFERENCE_KEY:'secret',BHASHINI_ASR_HI:'asr-id',BHASHINI_TTS_HI:'tts-id'},async(url,options)=>{
    calls.push({url,options,body:JSON.parse(options.body)});
    return {ok:true,json:async()=>calls.length===1?{pipelineResponse:[{taskType:'asr',output:[{source:'नमस्ते'}]}]}:{pipelineResponse:[{taskType:'tts',audio:[{audioContent:Buffer.from('wave').toString('base64')}]}]}};
  });
  assert.equal(client.available('asr','hi'),true);assert.equal(client.available('asr','en'),false);
  assert.equal(await client.transcribe('YWJj','hi'),'नमस्ते');
  assert.equal((await client.synthesize('नमस्ते','hi')).toString(),'wave');
  assert.equal(calls[0].options.headers.Authorization,'secret');
  assert.equal(calls[0].body.pipelineTasks[0].config.samplingRate,16000);
  assert.equal(calls[1].body.pipelineTasks[0].config.serviceId,'tts-id');
});
