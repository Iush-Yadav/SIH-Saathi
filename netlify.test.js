import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from './netlify/functions/api.mjs';

function fakeStores() {
  const stores=new Map();let version=0;
  return name=>{
    if(!stores.has(name))stores.set(name,new Map());
    const rows=stores.get(name);
    return {
      async get(key){return structuredClone(rows.get(key)?.value??null);},
      async getWithMetadata(key){const row=rows.get(key);return row?{data:structuredClone(row.value),etag:row.etag,metadata:{}}:null;},
      async setJSON(key,value,options={}){
        const row=rows.get(key);
        if(options.onlyIfNew&&row||options.onlyIfMatch&&row?.etag!==options.onlyIfMatch)return {modified:false};
        const etag=`"${++version}"`;rows.set(key,{value:structuredClone(value),etag});return {modified:true,etag};
      },
      async delete(key){rows.delete(key);}
    };
  };
}

test('Netlify API syncs family spaces and enforces one-use read-only care access',async()=>{
  const api=createApi({store:fakeStores(),companion:{model:'Qwen3',available:async()=>false},bhashini:{available:()=>false}});
  const call=async(path,method='GET',body,token)=>{
    const headers={'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
    const response=await api(new Request(`https://example.test${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),{ip:'127.0.0.1'});
    return {status:response.status,data:await response.json()};
  };
  const id='SAATHI-12345678-12345678-12345678-12345678';
  const created=await call('/api/shared','POST',{id,data:{profile:{name:'Asha'},sessions:[],reminders:[],checks:{}}});
  assert.equal(created.status,201);
  assert.equal((await call('/api/shared','POST',{id,data:{}})).status,409);
  const joined=await call('/api/shared-session','POST',{id});
  assert.equal(joined.status,200);
  assert.notEqual(joined.data.token,created.data.token);
  const saved=await call('/api/data','PUT',{data:{profile:{name:'Asha'},sessions:[],reminders:[{id:'r1',title:'Water',time:'10:00',active:true}],checks:{},conversation:[{id:'m1',role:'user',language:'en',content:'Hello'}]}},created.data.token);
  assert.equal(saved.status,200);
  const other=await call('/api/data','GET',undefined,joined.data.token);
  assert.equal(other.data.data.reminders[0].title,'Water');
  const invite=await call('/api/viewer','POST',{},created.data.token);
  assert.equal(invite.status,201);
  const viewer=await call('/api/viewer-session','POST',{invite:invite.data.invite});
  assert.equal(viewer.status,200);
  assert.equal((await call('/api/viewer-session','POST',{invite:invite.data.invite})).status,401);
  const readOnly=await call('/api/data','GET',undefined,viewer.data.token);
  assert.equal(readOnly.data.data.conversation,undefined);
  assert.equal((await call('/api/data','PUT',{data:{}},viewer.data.token)).status,403);
  assert.equal((await call('/api/data')).status,401);
  const status=await call('/api/companion/status');
  assert.deepEqual({status:status.status,model:status.data.model},{status:200,model:false});
});
