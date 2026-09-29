import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { mergeData } from '../../core.js';
import { cleanData } from '../../data-core.js';
import { createCompanionService } from '../../companion.js';
import { createBhashiniClient } from '../../bhashini.js';

export const config = {
  path: '/api/*',
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 60, windowLimit: 90 }
};

const hash = value => createHash('sha256').update(value).digest('hex');
const passwordHash = (passphrase, salt) => pbkdf2Sync(passphrase, salt, 210_000, 32, 'sha256').toString('hex');
const json = (status, value) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
const error = (status, message) => json(status, { error: message });

async function readBody(request) {
  const raw = await request.text();
  if(Buffer.byteLength(raw)>1_000_000)throw Object.assign(Error('Request too large'),{status:413});
  try{return JSON.parse(raw||'{}');}catch{throw Object.assign(Error('Invalid JSON.'),{status:400});}
}

export function createApi({ store = name => getStore({ name, consistency:'strong' }), companion = createCompanionService(), bhashini = createBhashiniClient() } = {}) {
  return async (request, context = {}) => {
    const pathname = new URL(request.url).pathname;
    const method = request.method;
    const spaces = store('saathi-spaces');
    const sessions = store('saathi-sessions');
    const invites = store('saathi-invites');
    const sessionFor = async (code,role='editor') => {
      const token=randomBytes(32).toString('base64url');
      await sessions.setJSON(hash(token),{code,role,expires:Date.now()+30*24*3600_000});
      return token;
    };
    const familyFor = async () => {
      const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
      if(!token)return null;
      const session=await sessions.get(hash(token),{type:'json'});
      return session?.expires>Date.now()?session:null;
    };

    try {
      if(pathname==='/api/shared'&&method==='POST'){
        const {id,data}=await readBody(request);
        if(typeof id!=='string'||!/^SAATHI-[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/.test(id))return error(400,'Invalid sharing ID.');
        const created=await spaces.setJSON(id,{code:id,shared:true,data:cleanData(data)},{onlyIfNew:true});
        if(!created.modified)return error(409,'This sharing ID is already in use.');
        return json(201,{code:id,token:await sessionFor(id),role:'editor'});
      }
      if(pathname==='/api/shared-session'&&method==='POST'){
        const {id}=await readBody(request);
        const code=String(id||'').trim().toUpperCase();
        if(!/^SAATHI-[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/.test(code))return error(400,'Invalid sharing ID.');
        const row=await spaces.get(code,{type:'json'});
        if(!row?.shared)return error(404,'Sharing ID was not found.');
        return json(200,{code,token:await sessionFor(code),role:'editor'});
      }
      if(pathname==='/api/companion/status'&&method==='GET')return json(200,{
        model:await companion.available(),modelName:companion.model,
        speech:{hi:{asr:bhashini.available('asr','hi'),tts:bhashini.available('tts','hi')},en:{asr:bhashini.available('asr','en'),tts:bhashini.available('tts','en')}}
      });
      if(pathname.startsWith('/api/companion/')&&method==='POST'){
        const input=await readBody(request);
        const language=['hi','en'].includes(input.language)?input.language:null;
        if(!language)return error(400,'Choose Hindi or English.');
        if(pathname==='/api/companion/reply'){
          const message=typeof input.message==='string'?input.message.trim():'';
          if(!message||message.length>1000)return error(400,'Message must be 1–1000 characters.');
          return json(200,await companion.reply(message,language,input.history,input.reminders));
        }
        if(pathname==='/api/companion/transcribe'){
          if(!bhashini.available('asr',language))return error(503,'Bhashini speech recognition is not connected.');
          const audio=typeof input.audioContent==='string'?input.audioContent:'';
          if(!audio||audio.length>800_000||!/^[A-Za-z0-9+/=]+$/.test(audio))return error(400,'Invalid audio recording.');
          return json(200,{text:await bhashini.transcribe(audio,language)});
        }
        if(pathname==='/api/companion/speak'){
          if(!bhashini.available('tts',language))return error(503,'Bhashini speech synthesis is not connected.');
          const message=typeof input.text==='string'?input.text.trim():'';
          if(!message||message.length>1200)return error(400,'Invalid text for speech.');
          const audio=await bhashini.synthesize(message,language);
          return new Response(audio,{headers:{'Content-Type':'audio/wav','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
        }
      }
      if(pathname==='/api/family'&&method==='POST'){
        const {passphrase}=await readBody(request);
        if(typeof passphrase!=='string'||passphrase.length<10||passphrase.length>200)return error(400,'Passphrase must be 10–200 characters.');
        let code,created;
        do {
          code=String(randomBytes(4).readUInt32BE()%100_000_000).padStart(8,'0');
          const salt=randomBytes(16).toString('hex');
          created=await spaces.setJSON(code,{code,salt,passhash:passwordHash(passphrase,salt),shared:false,data:{}},{onlyIfNew:true});
        } while(!created.modified);
        return json(201,{code,token:await sessionFor(code),role:'editor'});
      }
      if(pathname==='/api/session'&&method==='POST'){
        const {code,passphrase}=await readBody(request);
        const normalized=String(code||'').trim();
        const attempts=store('saathi-login-attempts');
        const key=hash(`${context.ip||'unknown'}:${normalized}`);
        const recent=((await attempts.get(key,{type:'json'}))?.times||[]).filter(time=>Date.now()-time<15*60_000);
        if(recent.length>=5)return error(429,'Too many attempts. Try again in 15 minutes.');
        const row=/^\d{8}$/.test(normalized)?await spaces.get(normalized,{type:'json'}):null;
        const provided=typeof passphrase==='string'&&row?.salt?Buffer.from(passwordHash(passphrase,row.salt),'hex'):Buffer.alloc(0);
        const expected=row?.passhash?Buffer.from(row.passhash,'hex'):Buffer.alloc(0);
        if(!provided.length||provided.length!==expected.length||!timingSafeEqual(provided,expected)){
          await attempts.setJSON(key,{times:[...recent,Date.now()]});
          return error(401,'Invalid family code or passphrase.');
        }
        await attempts.delete(key);
        return json(200,{code:normalized,token:await sessionFor(normalized),role:'editor'});
      }
      if(pathname==='/api/viewer-session'&&method==='POST'){
        const {invite}=await readBody(request);
        const key=hash(String(invite||'').trim());
        const entry=await invites.getWithMetadata(key,{type:'json'});
        if(!entry||entry.data.used||entry.data.expires<Date.now())return error(401,'Invalid or expired care-team invite.');
        const claimed=await invites.setJSON(key,{...entry.data,used:true},{onlyIfMatch:entry.etag});
        if(!claimed.modified)return error(401,'Invalid or expired care-team invite.');
        return json(200,{code:entry.data.code,token:await sessionFor(entry.data.code,'viewer'),role:'viewer'});
      }
      if(pathname==='/api/viewer'&&method==='POST'){
        const family=await familyFor();
        if(!family||family.role!=='editor')return error(403,'Caregiver access is required.');
        const invite=randomBytes(12).toString('base64url');
        await invites.setJSON(hash(invite),{code:family.code,expires:Date.now()+7*24*3600_000,used:false});
        return json(201,{invite,expiresInDays:7});
      }
      if(pathname==='/api/data'){
        const family=await familyFor();
        if(!family)return error(401,'Connect your family account again.');
        if(method==='GET'){
          const row=await spaces.get(family.code,{type:'json'});
          if(!row)return error(404,'Family space was not found.');
          const data={...(row.data||{})};
          if(family.role==='viewer'){delete data.conversation;delete data.conversationClearedAt;}
          return json(200,{data});
        }
        if(method==='PUT'){
          if(family.role!=='editor')return error(403,'This care-team access is read only.');
          const incoming=cleanData((await readBody(request)).data);
          for(let attempt=0;attempt<4;attempt++){
            const entry=await spaces.getWithMetadata(family.code,{type:'json'});
            if(!entry)return error(404,'Family space was not found.');
            const merged=mergeData(incoming,entry.data.data||{});
            const saved=await spaces.setJSON(family.code,{...entry.data,data:merged},{onlyIfMatch:entry.etag});
            if(saved.modified)return json(200,{data:merged});
          }
          return error(409,'The shared space changed. Please sync again.');
        }
      }
      return error(404,'Not found.');
    } catch(cause) {
      if(!cause.status)console.error('Saathi API error:',cause);
      return error(cause.status||500,cause.status?cause.message:'Service unavailable.');
    }
  };
}

export default (request,context) => createApi()(request,context);
