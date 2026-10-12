import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';
test('content lifecycle, validation, and durable storage',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'content-test-'));
 let server;
 const start=async()=>{server=createApp(dir);await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;};
 const stop=()=>new Promise(r=>server.close(r));
 try{
 let base=await start();
 const request=async(method,url,value)=>{const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)});return {status:res.status,data:await res.json()};};
 assert.match(await (await fetch(base)).text(),/콘텐츠 스튜디오/);
 assert.deepEqual((await request('GET','/api/content')).data,[]);
 const item={title:'월간 콘텐츠',channel:'뉴스레터',status:'제작 중',publish_date:'2026-10-15',cadence:30,notes:'참고 기록'};
 assert.equal((await request('POST','/api/content',{...item,publish_date:'2026-02-30'})).status,400);
 assert.equal((await request('POST','/api/content',{...item,title:' '})).status,400);
 assert.equal((await request('POST','/api/content',{...item,cadence:3})).status,400);
 const created=await request('POST','/api/content',item);assert.equal(created.status,201);const id=created.data.id;
 assert.equal((await request('PUT','/api/content/'+id,{...item,status:'발행 완료'})).data.status,'발행 완료');
 await stop();base=await start();
 const saved=(await request('GET','/api/content')).data;assert.equal(saved.length,1);assert.equal(saved[0].notes,item.notes);assert.equal(saved[0].status,'발행 완료');
 assert.equal((await request('DELETE','/api/content/'+id)).status,200);
 assert.deepEqual((await request('GET','/api/content')).data,[]);
 assert.equal((await request('DELETE','/api/content/'+id)).status,404);
 }finally{if(server?.listening)await stop();rmSync(dir,{recursive:true,force:true});}
});
