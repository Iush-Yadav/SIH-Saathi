import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mergeData } from './core.js';
import { createCompanionService } from './companion.js';
import { createBhashiniClient } from './bhashini.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.SAATHI_DB ? path.resolve(process.env.SAATHI_DB) : path.join(root, 'saathi.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS families (code TEXT PRIMARY KEY, salt TEXT NOT NULL, passhash TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS sessions (tokenhash TEXT PRIMARY KEY, family TEXT NOT NULL, expires INTEGER NOT NULL);`);
try { db.exec("ALTER TABLE sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'editor'"); } catch { /* Existing database already has the column. */ }
try { db.exec("ALTER TABLE families ADD COLUMN shared INTEGER NOT NULL DEFAULT 0"); } catch { /* Existing database already has the column. */ }
db.exec('CREATE TABLE IF NOT EXISTS viewer_codes (codehash TEXT PRIMARY KEY, family TEXT NOT NULL, expires INTEGER NOT NULL)');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.wav':'audio/wav' };
const hash = text => createHash('sha256').update(text).digest('hex');
const failedLogins = new Map();
const companionCalls = new Map();
const companion = createCompanionService();
const bhashini = createBhashiniClient();
const passwordHash = (passphrase, salt) => pbkdf2Sync(passphrase, salt, 210_000, 32, 'sha256').toString('hex');
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });res.end(JSON.stringify(data)); };
const body = async req => { let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>1_000_000)throw Error('Request too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'); };
const tokenFor = (code,role='editor') => {const token=randomBytes(32).toString('base64url');db.prepare('INSERT INTO sessions (tokenhash,family,expires,role) VALUES (?, ?, ?, ?)').run(hash(token),code,Date.now()+30*24*3600_000,role);return token;};
const familyFor = req => {const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)return null;const row=db.prepare('SELECT family, expires, role FROM sessions WHERE tokenhash = ?').get(hash(token));return row?.expires>Date.now()?{code:row.family,role:row.role}:null;};
function cleanData(input) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw Error('Invalid data');
  const str=(value,max)=>String(value??'').slice(0,max);
  const date=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():new Date().toISOString();
  const sessions=(Array.isArray(input.sessions)?input.sessions:[]).slice(-5000).filter(item=>item&&['memory','attention','routine','pattern'].includes(item.domain)).map(item=>({
    id:str(item.id,64),domain:item.domain,score:Math.max(0,Math.min(100,Number(item.score)||0)),level:Math.max(1,Math.min(3,Number(item.level)||1)),date:date(item.date),demo:!!item.demo
  }));
  const reminders=(Array.isArray(input.reminders)?input.reminders:[]).slice(-200).filter(item=>item&&typeof item==='object').map(item=>({
    id:str(item.id,64),category:['medicine','hydration','activity','appointment'].includes(item.category)?item.category:'activity',
    title:str(item.title,80),titleHi:str(item.titleHi,80),titleAs:str(item.titleAs,80),notes:str(item.notes,120),
    time:/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)?item.time:'09:00',active:!!item.active,deleted:!!item.deleted,updatedAt:date(item.updatedAt)
  }));
  const checks=Object.fromEntries(Object.entries(input.checks&&typeof input.checks==='object'&&!Array.isArray(input.checks)?input.checks:{}).slice(-10000).filter(([key])=>key.length<100).map(([key,value])=>[key,{done:typeof value==='object'?!!value.done:!!value,updatedAt:date(value?.updatedAt)}]));
  const profile=input.profile && typeof input.profile==='object'?{ name:String(input.profile.name||'').slice(0,40), updatedAt:String(input.profile.updatedAt||'') }:{};
  const conversation=(Array.isArray(input.conversation)?input.conversation:[]).slice(-200).filter(turn=>turn&&typeof turn==='object'&&['user','assistant'].includes(turn.role)&&['hi','en'].includes(turn.language)).map(turn=>({
    id:str(turn.id,64),role:turn.role,language:turn.language,content:str(turn.content,1200),mode:['demo','model','safety'].includes(turn.mode)?turn.mode:'model',date:date(turn.date)
  })).filter(turn=>turn.id&&turn.content);
  return { profile, sessions, reminders, checks, conversation, conversationClearedAt:input.conversationClearedAt?date(input.conversationClearedAt):'' };
}
async function handleApi(req,res,pathname) {
  try {
    if(pathname==='/api/shared'&&req.method==='POST'){
      const {id,data}=await body(req);
      if(typeof id!=='string'||!/^SAATHI-[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/.test(id))return json(res,400,{error:'Invalid sharing ID.'});
      const existing=db.prepare('SELECT 1 FROM families WHERE code = ?').get(id);
      if(existing)return json(res,409,{error:'This sharing ID is already in use.'});
      const salt=randomBytes(16).toString('hex');const passhash=passwordHash(randomBytes(32).toString('hex'),salt);
      db.prepare('INSERT INTO families (code,salt,passhash,data,shared) VALUES (?,?,?,?,1)').run(id,salt,passhash,JSON.stringify(cleanData(data)));
      return json(res,201,{code:id,token:tokenFor(id),role:'editor'});
    }
    if(pathname==='/api/shared-session'&&req.method==='POST'){
      const {id}=await body(req);const normalized=String(id||'').trim().toUpperCase();
      const row=db.prepare('SELECT code FROM families WHERE code = ? AND shared = 1').get(normalized);
      if(!row)return json(res,404,{error:'Sharing ID was not found.'});
      return json(res,200,{code:row.code,token:tokenFor(row.code),role:'editor'});
    }
    if(pathname==='/api/companion/status'&&req.method==='GET')return json(res,200,{
      model:await companion.available(), modelName:companion.model,
      speech:{hi:{asr:bhashini.available('asr','hi'),tts:bhashini.available('tts','hi')},en:{asr:bhashini.available('asr','en'),tts:bhashini.available('tts','en')}}
    });
    if(pathname.startsWith('/api/companion/')&&req.method==='POST'){
      const key=req.socket.remoteAddress||'local';const recent=(companionCalls.get(key)||[]).filter(time=>Date.now()-time<60_000);
      if(recent.length>=24)return json(res,429,{error:'Please wait a moment before trying again.'});
      recent.push(Date.now());companionCalls.set(key,recent);
      const input=await body(req);const language=input.language==='hi'?'hi':input.language==='en'?'en':null;
      if(!language)return json(res,400,{error:'Choose Hindi or English.'});
      if(pathname==='/api/companion/reply'){
        const message=typeof input.message==='string'?input.message.trim():'';
        if(!message||message.length>1000)return json(res,400,{error:'Message must be 1–1000 characters.'});
        return json(res,200,await companion.reply(message,language,input.history,input.reminders));
      }
      if(pathname==='/api/companion/transcribe'){
        if(!bhashini.available('asr',language))return json(res,503,{error:'Bhashini speech recognition is not connected.'});
        const audio=typeof input.audioContent==='string'?input.audioContent:'';
        if(!audio||audio.length>800_000||!/^[A-Za-z0-9+/=]+$/.test(audio))return json(res,400,{error:'Invalid audio recording.'});
        return json(res,200,{text:await bhashini.transcribe(audio,language)});
      }
      if(pathname==='/api/companion/speak'){
        if(!bhashini.available('tts',language))return json(res,503,{error:'Bhashini speech synthesis is not connected.'});
        const message=typeof input.text==='string'?input.text.trim():'';
        if(!message||message.length>1200)return json(res,400,{error:'Invalid text for speech.'});
        const audio=await bhashini.synthesize(message,language);
        res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':audio.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(audio);
      }
    }
    if(pathname==='/api/family'&&req.method==='POST'){
      const {passphrase}=await body(req);if(typeof passphrase!=='string'||passphrase.length<10||passphrase.length>200)return json(res,400,{error:'Passphrase must be 10–200 characters.'});
      const salt=randomBytes(16).toString('hex');let code;
      do {code=String(randomBytes(4).readUInt32BE()%100_000_000).padStart(8,'0');} while(db.prepare('SELECT 1 FROM families WHERE code = ?').get(code));
      db.prepare('INSERT INTO families (code,salt,passhash,data) VALUES (?,?,?,?)').run(code,salt,passwordHash(passphrase,salt),'{}');
      return json(res,201,{code,token:tokenFor(code)});
    }
    if(pathname==='/api/session'&&req.method==='POST'){
      const {code,passphrase}=await body(req);const normalized=String(code||'').trim();const row=db.prepare('SELECT salt,passhash FROM families WHERE code = ?').get(normalized);
      const loginKey=`${req.socket.remoteAddress}:${normalized}`;
      const attempts=(failedLogins.get(loginKey)||[]).filter(time=>Date.now()-time<15*60_000);
      if(attempts.length>=5)return json(res,429,{error:'Too many attempts. Try again in 15 minutes.'});
      const failure=()=>{attempts.push(Date.now());failedLogins.set(loginKey,attempts);return json(res,401,{error:'Invalid family code or passphrase.'});};
      if(!row||typeof passphrase!=='string')return failure();
      const provided=Buffer.from(passwordHash(passphrase,row.salt),'hex');const expected=Buffer.from(row.passhash,'hex');
      if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return failure();
      failedLogins.delete(loginKey);
      return json(res,200,{code:normalized,token:tokenFor(normalized)});
    }
    if(pathname==='/api/viewer-session'&&req.method==='POST'){
      const {invite}=await body(req);const key=hash(String(invite||'').trim());
      const row=db.prepare('SELECT family, expires FROM viewer_codes WHERE codehash = ?').get(key);
      if(!row||row.expires<Date.now())return json(res,401,{error:'Invalid or expired care-team invite.'});
      db.prepare('DELETE FROM viewer_codes WHERE codehash = ?').run(key);
      return json(res,200,{code:row.family,token:tokenFor(row.family,'viewer'),role:'viewer'});
    }
    if(pathname==='/api/viewer'&&req.method==='POST'){
      const family=familyFor(req);if(!family||family.role!=='editor')return json(res,403,{error:'Caregiver access is required.'});
      const invite=randomBytes(12).toString('base64url');
      db.prepare('INSERT INTO viewer_codes VALUES (?, ?, ?)').run(hash(invite),family.code,Date.now()+7*24*3600_000);
      return json(res,201,{invite,expiresInDays:7});
    }
    if(pathname==='/api/data'){
      const family=familyFor(req);if(!family)return json(res,401,{error:'Connect your family account again.'});
      if(req.method==='GET'){const row=db.prepare('SELECT data FROM families WHERE code = ?').get(family.code);const data=JSON.parse(row?.data||'{}');if(family.role==='viewer'){delete data.conversation;delete data.conversationClearedAt;}return json(res,200,{data});}
      if(req.method==='PUT'){
        if(family.role!=='editor')return json(res,403,{error:'This care-team access is read only.'});
        const incoming=cleanData((await body(req)).data);
        const existing=JSON.parse(db.prepare('SELECT data FROM families WHERE code = ?').get(family.code).data);
        const merged=mergeData(incoming,existing);
        db.prepare('UPDATE families SET data = ? WHERE code = ?').run(JSON.stringify(merged),family.code);
        return json(res,200,{data:merged});
      }
    }
    json(res,404,{error:'Not found.'});
  } catch(error){json(res,error.status|| (error.message==='Request too large'?413:400),{error:error.message||'Invalid request.'});}
}
http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/'))return handleApi(req,res,pathname);
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  const name=pathname==='/'?'index.html':pathname.slice(1);
  if(!['index.html','app.js','core.js','companion-core.js','styles.css','sw.js','icon.svg','manifest.webmanifest'].includes(name)&&!/^voice\/[a-z-]+\.wav$/.test(name)){res.writeHead(404);return res.end('Not found');}
  try{const content=await readFile(path.join(root,name));res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':name==='sw.js'?'no-cache':'public, max-age=60','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(req.method==='HEAD'?undefined:content);}catch{res.writeHead(404);res.end('Not found');}
}).listen(port,host,()=>console.log(`Saathi running at http://${host}:${port}`));
