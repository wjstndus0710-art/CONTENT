import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createApp} from '../server.js';
test('backup restores to an empty server atomically and never overwrites existing records',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'content-restore-'));const server=createApp(dir);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const restore=b=>fetch(base+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
 try{const backup={content:[{id:7,title:'복원 콘텐츠',channel:'블로그',status:'아이디어',publish_date:'2026-10-12',cadence:14,notes:'메모',metadata:{owner:'담당자'}}],records:[],sources:[],importItems:[]};
 assert.equal((await restore({...backup,content:[{...backup.content[0],publish_date:'2026-02-30'}]})).status,400);
 assert.equal((await restore({...backup,importItems:[{source_key:'duplicate',kind:'content',record_id:7},{source_key:'duplicate',kind:'content',record_id:7}]})).status,400);
 assert.deepEqual(await (await fetch(base+'/api/content')).json(),[]);
 assert.equal((await restore(backup)).status,200);assert.equal((await restore(backup)).status,409);
 assert.deepEqual((await (await fetch(base+'/api/export')).json()).content,backup.content);
 }finally{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
