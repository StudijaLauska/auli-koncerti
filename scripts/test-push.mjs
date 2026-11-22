// Checks when push notifications are sent (no real push service; sendNotification is replaced). Run: node scripts/test-push.mjs
import webpush from 'web-push';
import fs from 'node:fs';
import { handle } from '../lib/api.mjs';
const v = webpush.generateVAPIDKeys();
const env = { VAPID_PUBLIC_KEY: v.publicKey, VAPID_PRIVATE_KEY: v.privateKey };
const db = {};
const store = { async get(k){return db[k]??null}, async setJSON(k,x){db[k]=structuredClone(x)}, async delete(k){delete db[k]}, async list({prefix=''}={}){return {blobs:Object.keys(db).filter(k=>k.startsWith(prefix)).map(key=>({key}))}} };
db.members=[{id:'m1',name:'Kaspars'}];
const sent=[];
webpush.sendNotification = async (sub, payload, opts) => {
  // real encryption/vapid check
  webpush.generateRequestDetails(sub, payload, opts);
  if (sub.endpoint.includes('gone')) { const e=new Error('gone'); e.statusCode=410; throw e; }
  sent.push([sub.endpoint, JSON.parse(payload)]);
};
const call = async (method, path, body) => { const r = await handle(new Request('http://x/api/'+path,{method, headers:{'content-type':'application/json'}, body: body?JSON.stringify(body):undefined}), store, env); return [r.status, await r.json()]; };
// real client keys
const ecdh = (await import('node:crypto')).createECDH('prime256v1'); ecdh.generateKeys();
const keys = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: Buffer.from('1234567890123456').toString('base64url') };
console.log(await call('GET','push/key'));
for (const ep of ['https://push.example/a','https://push.example/b','https://push.example/gone']) console.log(await call('POST','push/subscribe',{subscription:{endpoint:ep,keys},memberId:'m1'}));
console.log(await call('POST','push/subscribe',{subscription:{endpoint:'http://bad',keys}}));
let [, {event}] = await call('POST','events',{event:{title:'Ražas svētki',date:'2026-12-12',time:'19:00',place:'Rīga'},pushEndpoint:'https://push.example/a'});
console.log('new ->', sent.splice(0)); console.log('subs left', Object.keys(db).filter(k=>k.startsWith('push/')).length);
await call('POST','events',{event:{...event, notes:'x'}}); console.log('edit ->', sent.splice(0));
await call('POST','events',{event:{...event, status:'confirmed'}}); console.log('confirm ->', sent.splice(0));
await call('POST','events',{event:{...event, status:'cancelled'}}); console.log('confirmed->cancelled ->', sent.splice(0));
await call('POST','events',{event:{...event, status:'planning'}}); await call('POST','events',{event:{...event, status:'cancelled', kind:'rehearsal'}}); console.log('plan->cancel ->', sent.splice(0));
console.log(await call('POST','push/test',{endpoint:'https://push.example/b'}), sent.splice(0));
console.log(await call('POST','push/unsubscribe',{endpoint:'https://push.example/b'}), Object.keys(db));
const data = await call('GET','data'); console.log(Object.keys(data[1]));
// no keys -> no sending, saving ok
const r = await handle(new Request('http://x/api/events',{method:'POST',body:JSON.stringify({event:{title:'Y'}})}), store, {}); console.log(r.status, sent.length);
