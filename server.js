import http from 'node:http';
import {createHash, timingSafeEqual} from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const invalidContent=c=>{if(!c || typeof c!=='object' || Array.isArray(c))return true;const date=new Date(`${c.publish_date}T00:00:00Z`);return typeof c.title !== 'string' || !c.title.trim() || c.title.length>200 || !['','블로그','인스타그램','유튜브','뉴스레터','기타','네이버 블로그','스티비','홈페이지 인사이트','티스토리','카카오톡 소식'].includes(c.channel) || !['아이디어','제작 중','발행 예정','발행 완료','발행 확인 필요'].includes(c.status) || (c.publish_date!=='' && (!/^\d{4}-\d{2}-\d{2}$/.test(c.publish_date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==c.publish_date)) || ![0,7,14,30].includes(c.cadence) || typeof c.notes!=='string' || c.notes.length>10000;};
const root = path.dirname(fileURLToPath(import.meta.url));
export function createApp(dataDir = process.env.DATA_DIR || path.join(root, 'data'), auth = {}) {
 const username=auth.username ?? process.env.APP_USER ?? 'admin';
 const password=auth.password ?? process.env.APP_PASSWORD;
 const production=auth.production ?? (process.env.NODE_ENV==='production');
 if(production && (typeof password!=='string' || password.length<12)) throw new Error('Production requires APP_PASSWORD with at least 12 characters. Set it securely in hosting settings.');
 const digest=value=>createHash('sha256').update(value).digest();
 const expected=password?digest(username+':'+password):null;
 mkdirSync(dataDir, {recursive:true});
 const db = new DatabaseSync(path.join(dataDir,'content.sqlite'));
 db.exec(`CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY, title TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL, publish_date TEXT NOT NULL, cadence INTEGER NOT NULL, notes TEXT NOT NULL)`);
 if (!db.prepare('PRAGMA table_info(content)').all().some(c=>c.name==='metadata')) db.exec("ALTER TABLE content ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
 db.exec(`CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, fields TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS import_items(source_key TEXT PRIMARY KEY,kind TEXT NOT NULL,record_id INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS import_sources(sha256 TEXT PRIMARY KEY,filename TEXT NOT NULL,sheets TEXT NOT NULL);`);
 const decode=c=>({...c,metadata:JSON.parse(c.metadata)});
 const json = (res, code, value) => {res.writeHead(code, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value));};
 const server = http.createServer(async (req,res) => {
  try {
   const url = new URL(req.url,'http://localhost');
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('X-Frame-Options','DENY');
   res.setHeader('Referrer-Policy','same-origin');
   res.setHeader('Cache-Control','no-store');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
   if(url.pathname==='/healthz' && req.method==='GET') {db.prepare('SELECT 1').get();return json(res,200,{ok:true});}
   if(expected){
    const header=req.headers.authorization||'';
    const supplied=header.startsWith('Basic ')?Buffer.from(header.slice(6),'base64').toString('utf8'):'';
    if(!timingSafeEqual(expected,digest(supplied))){res.setHeader('WWW-Authenticate','Basic realm="Content Studio", charset="UTF-8"');return json(res,401,{error:'로그인이 필요합니다.'});}
   }
   if(['POST','PUT','DELETE'].includes(req.method)){
    if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{return json(res,403,{error:'허용되지 않은 요청입니다.'});}if(origin.host!==req.headers.host)return json(res,403,{error:'허용되지 않은 요청입니다.'});}
    if(['POST','PUT'].includes(req.method) && !(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'JSON 형식으로 요청해 주세요.'});
   }
   const match = url.pathname.match(/^\/api\/content\/(\d+)$/);
   if (url.pathname === '/api/content' && req.method === 'GET') return json(res,200,db.prepare('SELECT * FROM content ORDER BY publish_date,id').all().map(decode));
   if ((url.pathname === '/api/content' && req.method === 'POST') || (match && req.method === 'PUT')) {
    let body = ''; for await (const chunk of req) {body += chunk; if (Buffer.byteLength(body)>65536) return json(res,413,{error:'입력 내용이 너무 큽니다.'});}
    let c; try {c=JSON.parse(body);} catch {return json(res,400,{error:'입력 형식이 잘못되었습니다.'});}
    if (!c || typeof c!=='object' || Array.isArray(c)) return json(res,400,{error:'입력 형식이 잘못되었습니다.'});
    if(invalidContent(c)) return json(res,400,{error:'제목, 채널, 상태, 발행일과 주기를 확인해 주세요.'});
    const old=match?db.prepare('SELECT * FROM content WHERE id=?').get(Number(match[1])):null;
    const metadata=c.metadata??(old?JSON.parse(old.metadata):{});
    const textFields=['business','main_keyword','naver_exposure','sub_keywords','owner'];
    if(!metadata || typeof metadata!=='object' || Array.isArray(metadata) || textFields.some(k=>metadata[k]!==undefined && (typeof metadata[k]!=='string'||metadata[k].length>2000)) || (metadata.channel_statuses!==undefined && (!metadata.channel_statuses || typeof metadata.channel_statuses!=='object' || Array.isArray(metadata.channel_statuses) || Object.entries(metadata.channel_statuses).some(([k,v])=>!['네이버','홈페이지','티스토리','카카오','인스타'].includes(k)||!['','미작성','작성중','검수중','예약','발행완료'].includes(v))))) return json(res,400,{error:'사업부와 채널별 상태를 확인해 주세요.'});
    // Preserve workbook provenance and original progress when editing user-facing metadata.
    for(const key of ['source_progress','source_sheet','source_row']) if(old && JSON.parse(old.metadata)[key]!==undefined) metadata[key]=JSON.parse(old.metadata)[key];
    const values=[c.title.trim(),c.channel,c.status,c.publish_date,c.cadence,c.notes,JSON.stringify(metadata)];
    let id;
    if(match) {id=Number(match[1]); const result=db.prepare('UPDATE content SET title=?,channel=?,status=?,publish_date=?,cadence=?,notes=?,metadata=? WHERE id=?').run(...values,id); if(!result.changes) return json(res,404,{error:'콘텐츠를 찾을 수 없습니다.'});}
    else id=Number(db.prepare('INSERT INTO content(title,channel,status,publish_date,cadence,notes,metadata) VALUES(?,?,?,?,?,?,?)').run(...values).lastInsertRowid);
    return json(res,match?200:201,decode(db.prepare('SELECT * FROM content WHERE id=?').get(id)));
   }
   if(match && req.method==='DELETE') {const r=db.prepare('DELETE FROM content WHERE id=?').run(Number(match[1])); return json(res,r.changes?200:404,r.changes?{ok:true}:{error:'콘텐츠를 찾을 수 없습니다.'});}
   if(url.pathname==='/api/import-summary' && req.method==='GET') return json(res,200,db.prepare('SELECT sha256,filename FROM import_sources').all());
   if(url.pathname==='/api/export' && req.method==='GET') {res.setHeader('Content-Disposition','attachment; filename="content-backup.json"'); return json(res,200,{content:db.prepare('SELECT * FROM content').all().map(decode),records:db.prepare('SELECT * FROM records').all().map(r=>({...r,fields:JSON.parse(r.fields)})),importItems:db.prepare('SELECT * FROM import_items').all(),sources:db.prepare('SELECT * FROM import_sources').all().map(r=>({...r,sheets:JSON.parse(r.sheets)}))});}
   if(url.pathname==='/api/restore' && req.method==='POST') {
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>5242880)return json(res,413,{error:'백업 파일은 5MB 이하만 지원합니다.'});}
    let backup;try{backup=JSON.parse(body);}catch{return json(res,400,{error:'JSON 백업 파일을 확인해 주세요.'});}
    if(!backup || !Array.isArray(backup.content)||!Array.isArray(backup.records)||!Array.isArray(backup.sources)||backup.content.length+backup.records.length>10000)return json(res,400,{error:'지원되는 콘텐츠 백업 파일이 아닙니다.'});
    const validId=id=>Number.isSafeInteger(id)&&id>0;
    const contentIds=new Set(),recordIds=new Set();
    for(const c of backup.content){if(invalidContent(c)||!validId(c.id)||contentIds.has(c.id)||!c.metadata||typeof c.metadata!=='object'||Array.isArray(c.metadata))return json(res,400,{error:'콘텐츠 백업 항목을 확인해 주세요.'});contentIds.add(c.id);}
    for(const r of backup.records){if(!validId(r.id)||recordIds.has(r.id)||!['publications','keywords'].includes(r.kind)||!r.fields||typeof r.fields!=='object'||Array.isArray(r.fields)||Object.values(r.fields).some(v=>typeof v!=='string'))return json(res,400,{error:'발행·키워드 백업 항목을 확인해 주세요.'});recordIds.add(r.id);}
    for(const source of backup.sources)if(!/^[a-f0-9]{64}$/.test(source.sha256)||typeof source.filename!=='string'||!source.sheets||typeof source.sheets!=='object')return json(res,400,{error:'원본 시트 백업을 확인해 주세요.'});
    const importItems=backup.importItems??[];
    if(!Array.isArray(importItems)||importItems.some(i=>typeof i.source_key!=='string'||!['content','publications','keywords'].includes(i.kind)||!validId(i.record_id)||!(i.kind==='content'?contentIds:recordIds).has(i.record_id)))return json(res,400,{error:'가져오기 이력을 확인해 주세요.'});
    if(db.prepare('SELECT COUNT(*) AS n FROM content').get().n||db.prepare('SELECT COUNT(*) AS n FROM records').get().n||db.prepare('SELECT COUNT(*) AS n FROM import_sources').get().n)return json(res,409,{error:'기존 데이터 보호를 위해 빈 서버에서만 복원할 수 있습니다.'});
    db.exec('BEGIN IMMEDIATE');
    try{
     const insert=db.prepare('INSERT INTO content(id,title,channel,status,publish_date,cadence,notes,metadata) VALUES(?,?,?,?,?,?,?,?)');
     for(const c of backup.content)insert.run(c.id,c.title,c.channel,c.status,c.publish_date,c.cadence,c.notes,JSON.stringify(c.metadata));
     for(const r of backup.records)db.prepare('INSERT INTO records(id,kind,fields) VALUES(?,?,?)').run(r.id,r.kind,JSON.stringify(r.fields));
     for(const source of backup.sources)db.prepare('INSERT INTO import_sources VALUES(?,?,?)').run(source.sha256,source.filename,JSON.stringify(source.sheets));
     for(const item of importItems)db.prepare('INSERT INTO import_items VALUES(?,?,?)').run(item.source_key,item.kind,item.record_id);
     db.exec('COMMIT');
    }catch{db.exec('ROLLBACK');return json(res,400,{error:'백업을 복원하지 못했습니다. 기존 상태를 유지했습니다.'});}
    return json(res,200,{content:backup.content.length,records:backup.records.length});
   }
   const recordsMatch=url.pathname.match(/^\/api\/records\/(publications|keywords)(?:\/(\d+))?$/);
   if(recordsMatch) {
    const [,kind,id]=recordsMatch;
    if(req.method==='GET' && !id) return json(res,200,db.prepare('SELECT * FROM records WHERE kind=? ORDER BY id').all(kind).map(r=>({...r,fields:JSON.parse(r.fields)})));
    if(req.method==='DELETE' && id) {const r=db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,Number(id)); return json(res,r.changes?200:404,{ok:!!r.changes});}
    if((req.method==='POST' && !id)||(req.method==='PUT' && id)) {
     let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536)return json(res,413,{error:'입력 내용이 너무 큽니다.'});}
     let fields;try{fields=JSON.parse(body);}catch{return json(res,400,{error:'입력 형식이 잘못되었습니다.'});}
     const keys=kind==='publications'?['콘텐츠 ID','사업부/서비스','채널','채널별 제목','타깃 키워드','콘텐츠 형태','발행 예정일','발행일','URL','상태']:['키워드','사업부/서비스','콘텐츠 ID','관련 콘텐츠','네이버 노출','Google 노출','AI 노출','기존 콘텐츠 여부','신규 작성 필요','최근 확인일'];
     if(!fields || typeof fields!=='object'||Array.isArray(fields)||keys.some(k=>typeof fields[k]!=='string'||fields[k].length>2000)||Object.keys(fields).some(k=>!keys.includes(k))||!fields[kind==='publications'?'채널별 제목':'키워드'].trim())return json(res,400,{error:'필수 제목 또는 키워드를 입력해 주세요.'});
     for(const key of ['발행 예정일','발행일','최근 확인일']) {const value=fields[key];if(value){const d=new Date(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)return json(res,400,{error:'날짜를 확인해 주세요.'});}}
     let rid=Number(id);
     if(id){if(!db.prepare('UPDATE records SET fields=? WHERE kind=? AND id=?').run(JSON.stringify(fields),kind,rid).changes)return json(res,404,{error:'기록을 찾을 수 없습니다.'});}
     else rid=Number(db.prepare('INSERT INTO records(kind,fields) VALUES(?,?)').run(kind,JSON.stringify(fields)).lastInsertRowid);
     return json(res,id?200:201,{id:rid,kind,fields});
    }
   }
   const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
   if(req.method==='GET' && files[url.pathname]) {const [file,type]=files[url.pathname]; res.writeHead(200,{'Content-Type':type+'; charset=utf-8'}); return res.end(readFileSync(path.join(root,'public',file)));}
   json(res,404,{error:'페이지를 찾을 수 없습니다.'});
  } catch {json(res,500,{error:'저장 처리에 실패했습니다.'});}
 });
 server.on('close',()=>db.close());
 return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const server=createApp();server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Content Studio started on port '+(process.env.PORT||3000)));
 const stop=()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();};
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
