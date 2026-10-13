import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createApp} from '../server.js';
const root=path.resolve(import.meta.dirname,'..');
test('marketing journal days, weekly focus, workbook import and backup round trip',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'content-journal-')),empty=mkdtempSync(path.join(tmpdir(),'content-journal-restore-'));
 let server,restored;
 const listen=async s=>{await new Promise(r=>s.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${s.address().port}`;};
 try{
  const run=()=>JSON.parse(execFileSync('python3',[path.join(root,'scripts/import_xlsx.py'),path.join(root,'test/fixtures/journal.xlsx'),'--data-dir',dir],{encoding:'utf8'}));
  const first=run();assert.equal(first.journal_days,4);assert.equal(first.journal_weeks,1);assert.equal(first.content,0);assert.equal(run().journal_days,0);
  server=createApp(dir);const base=await listen(server);
  const req=async(method,url,value,target=base)=>{const res=await fetch(target+url,{method,headers:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)});return {status:res.status,data:await res.json()};};
  const loaded=(await req('GET','/api/journal')).data;
  assert.deepEqual(loaded.days.map(d=>d.date),['2026-10-01','2026-10-02','2026-10-06','2026-10-07']);
  assert.deepEqual(loaded.days[0].tasks,[{text:'가상 아티클 작성',done:false},{text:'썸네일 제작',done:false}]);
  assert.deepEqual(loaded.days[3].tasks.map(t=>t.text),['가상 검수 요청']);
  assert.deepEqual(loaded.weeks.map(w=>[w.week_start,w.focus]),[['2026-09-28','주간 목표 예시']]);
  const saved=await req('PUT','/api/journal/days/2026-10-13',{tasks:[{text:' 썸네일 제작 ',done:true},{text:'업로드',done:false}]});
  assert.equal(saved.status,200);assert.deepEqual(saved.data.tasks[0],{text:'썸네일 제작',done:true});
  assert.equal((await req('PUT','/api/journal/days/2026-02-30',{tasks:[]})).status,400);
  assert.equal((await req('PUT','/api/journal/days/2026-10-13',{tasks:[{text:' ',done:false}]})).status,400);
  assert.equal((await req('PUT','/api/journal/days/2026-10-13',{tasks:[{text:'a',done:'yes'}]})).status,400);
  assert.equal((await req('PUT','/api/journal/weeks/2026-10-13',{focus:'화요일'})).status,400);
  assert.equal((await req('PUT','/api/journal/weeks/2026-10-12',{focus:'EDI 주 2회 업로드'})).data.focus,'EDI 주 2회 업로드');
  const backup=(await req('GET','/api/export')).data;assert.equal(backup.journalDays.length,5);assert.equal(backup.journalWeeks.length,2);
  restored=createApp(empty);const other=await listen(restored);
  assert.equal((await req('POST','/api/restore',{...backup,journalDays:[...backup.journalDays,{...backup.journalDays[0],id:99}]},other)).status,400);
  assert.equal((await req('POST','/api/restore',backup,other)).status,200);
  assert.deepEqual((await req('GET','/api/journal',undefined,other)).data,(await req('GET','/api/journal')).data);
  assert.equal((await req('POST','/api/restore',backup,other)).status,409);
 }finally{
  for(const s of [server,restored])if(s?.listening)await new Promise(r=>s.close(r));
  rmSync(dir,{recursive:true,force:true});rmSync(empty,{recursive:true,force:true});
 }
});
