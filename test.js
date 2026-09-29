import test from 'node:test';
import assert from 'node:assert/strict';
import { nextLevel, domainScores, activityTrend, mergeData, hindiIntent, englishIntent } from './core.js';

test('adaptive levels respond to recent performance',()=>{
  assert.equal(nextLevel([], 'memory'),1);
  assert.equal(nextLevel([{domain:'memory',score:100,level:1},{domain:'memory',score:90,level:1}], 'memory'),2);
  assert.equal(nextLevel([{domain:'memory',score:30,level:2},{domain:'memory',score:20,level:2}], 'memory'),1);
  assert.equal(nextLevel([{domain:'memory',score:100,level:1,demo:true}], 'memory'),1);
});
test('Hindi voice intents distinguish the memory game from reminders',()=>{
  assert.equal(hindiIntent('याददाश्त खेल शुरू करो'),'memory');
  assert.equal(hindiIntent('दवा की याद दिलाओ'),'reminders');
  assert.equal(hindiIntent('ध्यान खेल'),'attention');
});
test('English voice intents follow the selected language',()=>{
  assert.equal(englishIntent('start the memory game'),'memory');
  assert.equal(englishIntent('read my medicine reminders'),'reminders');
  assert.equal(englishIntent('find the fruit'),'attention');
});
test('caregiver averages are per domain and decline needs six days of real play',()=>{
  const sessions=Array.from({length:6},(_,i)=>({domain:'memory',score:i<3?80:40,date:`2026-09-${String(i+1).padStart(2,'0')}T10:00:00Z`}));
  assert.equal(domainScores(sessions).memory,56);
  assert.equal(activityTrend(sessions).lower,true);
  assert.equal(activityTrend(sessions.map(s=>({...s,demo:true}))),null);
  assert.equal(activityTrend(sessions.map(s=>({...s,demo:true})),true).lower,true);
});
test('sync merges sessions and newest reminder edit',()=>{
  const local={profile:{name:'A',updatedAt:'2026-09-01'},sessions:[{id:'1',date:'2026-09-01'}],reminders:[{id:'r',title:'new',updatedAt:'2026-09-02'}],checks:{}};
  const remote={profile:{name:'B',updatedAt:'2026-09-02'},sessions:[{id:'2',date:'2026-09-02'}],reminders:[{id:'r',title:'old',updatedAt:'2026-09-01'}],checks:{}};
  const merged=mergeData(local,remote);
  assert.equal(merged.profile.name,'B');assert.equal(merged.sessions.length,2);assert.equal(merged.reminders[0].title,'new');
});
test('sync preserves a deleted reminder and latest completion state',()=>{
  const local={profile:{updatedAt:'2026-09-01'},sessions:[],reminders:[{id:'r',deleted:true,updatedAt:'2026-09-03'}],checks:{'2026-09-03:r':{done:false,updatedAt:'2026-09-03'}}};
  const remote={profile:{updatedAt:'2026-09-01'},sessions:[],reminders:[{id:'r',deleted:false,updatedAt:'2026-09-02'}],checks:{'2026-09-03:r':{done:true,updatedAt:'2026-09-02'}}};
  const merged=mergeData(local,remote);
  assert.equal(merged.reminders[0].deleted,true);
  assert.equal(merged.checks['2026-09-03:r'].done,false);
});
test('shared conversations merge across devices and clearing removes older turns',()=>{
  const first={id:'a',role:'user',language:'hi',content:'नमस्ते',date:'2026-09-01T10:00:00Z'};
  const second={id:'b',role:'assistant',language:'hi',content:'नमस्ते!',date:'2026-09-01T10:01:00Z'};
  assert.deepEqual(mergeData({conversation:[first]},{conversation:[second]}).conversation.map(turn=>turn.id),['a','b']);
  const cleared=mergeData({conversation:[],conversationClearedAt:'2026-09-01T10:00:30Z'},{conversation:[first,second]});
  assert.deepEqual(cleared.conversation.map(turn=>turn.id),['b']);
});
