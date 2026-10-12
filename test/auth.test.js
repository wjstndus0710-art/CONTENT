import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';
test('production refuses unset/short password; authentication protects pages, data and backups',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'content-auth-'));let server;
 try {
 assert.throws(()=>createApp(dir,{production:true,password:''}),/APP_PASSWORD/);
 assert.throws(()=>createApp(dir,{production:true,password:'short'}),/APP_PASSWORD/);
 server=createApp(dir,{production:true,username:'tester',password:'test-only-password'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/healthz')).status,200);
 for(const endpoint of ['/','/app.js','/api/content','/api/export','/api/records/keywords'])assert.equal((await fetch(base+endpoint)).status,401);
 assert.equal((await fetch(base+'/api/content',{headers:{Authorization:'Basic '+Buffer.from('tester:wrong').toString('base64')}})).status,401);
 const headers={Authorization:'Basic '+Buffer.from('tester:test-only-password').toString('base64'),'Content-Type':'application/json'};
 const page=await fetch(base,{headers});assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const item={title:'인증 검증',channel:'블로그',status:'아이디어',publish_date:'2026-10-12',cadence:7,notes:''};
 assert.equal((await fetch(base+'/api/content',{method:'POST',headers:{...headers,Origin:'https://other.example'},body:JSON.stringify(item)})).status,403);
 assert.equal((await fetch(base+'/api/content',{method:'POST',headers:{...headers,Origin:base},body:JSON.stringify(item)})).status,201);
 assert.equal((await (await fetch(base+'/api/content',{headers})).json()).length,1);
 }finally{if(server?.listening)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
