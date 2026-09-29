export function cleanData(input) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw Object.assign(Error('Invalid data'),{status:400});
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
