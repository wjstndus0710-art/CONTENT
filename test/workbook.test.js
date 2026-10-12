import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createApp} from '../server.js';
const root=path.resolve(import.meta.dirname,'..');
test('workbook mapping, duplicate prevention, editable metadata and auxiliary records',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'content-import-'));
 let server;
 const start=async()=>{server=createApp(dir);await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;};
 const stop=()=>new Promise(r=>server.close(r));
 try{
  await start();await stop();
  const source=path.join(root,'test/fixtures/calendar.xlsx');
  const run=()=>JSON.parse(execFileSync('python3',[path.join(root,'scripts/import_xlsx.py'),source,'--data-dir',dir],{encoding:'utf8'}));
  assert.deepEqual([run().content], [18]);const repeat=run();assert.equal(repeat.content,0);assert.equal(repeat.skipped,27);
  const base=await start();const req=async(method,url,value)=>{const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)});return {status:res.status,data:await res.json()};};
  const content=(await req('GET','/api/content')).data;assert.equal(content.length,18);assert.equal(content[0].publish_date,'2026-08-27');assert.equal(content[0].metadata.channel_statuses['인스타'],'작성중');assert.equal(content[0].metadata.source_progress,'1');
  assert.equal(content.find(c=>c.title==='콘텐츠 17').channel,'');
  assert.equal(content.filter(c=>c.channel==='스티비').every(c=>c.status==='발행 확인 필요'),true);
  const item=content[0];const changed=await req('PUT','/api/content/'+item.id,{...item,metadata:{...item.metadata,owner:'테스트 담당자',source_progress:'0',channel_statuses:{...item.metadata.channel_statuses,'인스타':'발행완료'}}});assert.equal(changed.status,200);assert.equal(changed.data.metadata.source_progress,'1');assert.equal(changed.data.metadata.owner,'테스트 담당자');
  assert.equal((await req('PUT','/api/content/'+item.id,{...item,metadata:{channel_statuses:{'네이버':'bogus'}}})).status,400);
  const publications=(await req('GET','/api/records/publications')).data;assert.equal(publications.length,4);assert.equal(publications[0].fields.URL,'38');assert.equal(publications[0].fields['발행일'],'');
  const updated=await req('PUT','/api/records/publications/'+publications[0].id,{...publications[0].fields,URL:'https://example.com/article','발행일':'2026-10-12'});assert.equal(updated.status,200);
  assert.equal((await req('POST','/api/records/publications',{...publications[0].fields,'발행일':'2026-02-30'})).status,400);
  const keywords=(await req('GET','/api/records/keywords')).data;assert.equal(keywords.length,5);
  const added=await req('POST','/api/records/keywords',{...keywords[0].fields,'키워드':'새 키워드'});assert.equal(added.status,201);assert.equal((await req('DELETE','/api/records/keywords/'+added.data.id)).status,200);
  const backup=(await req('GET','/api/export')).data;assert.equal(backup.sources.length,1);assert.equal(Object.keys(backup.sources[0].sheets).length,6);assert.equal(backup.records.length,9);
 }finally{if(server?.listening)await stop();rmSync(dir,{recursive:true,force:true});}
});
