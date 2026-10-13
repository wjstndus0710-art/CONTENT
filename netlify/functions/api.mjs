// Netlify version of the journal API: same routes as server.js, stored in Netlify Blobs.
import {createHash, timingSafeEqual} from 'node:crypto';
import {validDate, invalidTasks, isMonday} from '../../journal-rules.js';

const json=(status,value,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const digest=value=>createHash('sha256').update(value).digest();

// store: {keys(prefix), get(key), set(key,value)} — Netlify Blobs in production, a Map in tests.
export function createHandler(store, env=process.env) {
 const readAll=async()=>{
  const [dayKeys,weekKeys]=await Promise.all([store.keys('days/'),store.keys('weeks/')]);
  const days=(await Promise.all(dayKeys.map(k=>store.get(k)))).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
  const weeks=(await Promise.all(weekKeys.map(k=>store.get(k)))).filter(Boolean).sort((a,b)=>a.week_start.localeCompare(b.week_start));
  return {days,weeks};
 };
 return async req=>{
  const password=env.APP_PASSWORD,username=env.APP_USER||'admin';
  if(typeof password!=='string'||password.length<12) return json(503,{error:'Netlify 환경 변수 APP_PASSWORD(12자 이상)를 설정해 주세요.'});
  const header=req.headers.get('authorization')||'';
  const supplied=header.startsWith('Basic ')?Buffer.from(header.slice(6),'base64').toString('utf8'):'';
  if(!timingSafeEqual(digest(username+':'+password),digest(supplied))) return json(401,{error:'로그인이 필요합니다.'},{'WWW-Authenticate':'Basic realm="Marketing Journal", charset="UTF-8"'});
  const url=new URL(req.url);
  if(['POST','PUT'].includes(req.method)){
   const origin=req.headers.get('origin');
   if(origin){let host;try{host=new URL(origin).host;}catch{host=null;}if(host!==url.host)return json(403,{error:'허용되지 않은 요청입니다.'});}
   if(!(req.headers.get('content-type')||'').startsWith('application/json'))return json(415,{error:'JSON 형식으로 요청해 주세요.'});
  }
  const readBody=async limit=>{const text=await req.text();if(Buffer.byteLength(text)>limit)return {error:413};try{return {value:JSON.parse(text)};}catch{return {error:400};}};
  try{
   if(url.pathname==='/api/journal'&&req.method==='GET') return json(200,await readAll());
   const match=url.pathname.match(/^\/api\/journal\/(days|weeks)\/(\d{4}-\d{2}-\d{2})$/);
   if(match&&req.method==='PUT'){
    const [,part,date]=match;
    if(part==='days'?!validDate(date):!isMonday(date)) return json(400,{error:part==='days'?'날짜를 확인해 주세요.':'주간 목표는 월요일 날짜로 저장합니다.'});
    const body=await readBody(65536);if(body.error)return json(body.error,{error:body.error===413?'입력 내용이 너무 큽니다.':'입력 형식이 잘못되었습니다.'});
    const v=body.value;
    if(part==='days'){
     if(!v||typeof v!=='object'||invalidTasks(v.tasks)) return json(400,{error:'할 일은 500자 이내로 100개까지 입력할 수 있습니다.'});
     const day={date,tasks:v.tasks.map(t=>({text:t.text.trim(),done:t.done}))};await store.set('days/'+date,day);return json(200,day);
    }
    if(!v||typeof v!=='object'||typeof v.focus!=='string'||v.focus.length>2000) return json(400,{error:'주간 목표는 2000자 이내로 입력해 주세요.'});
    const week={week_start:date,focus:v.focus};await store.set('weeks/'+date,week);return json(200,week);
   }
   if(url.pathname==='/api/export'&&req.method==='GET'){
    // Same shape as the Node server's backup, so either version can restore it.
    const {days,weeks}=await readAll();
    return json(200,{content:[],records:[],sources:[],importItems:[],journalDays:days.map((d,i)=>({id:i+1,...d})),journalWeeks:weeks.map((w,i)=>({id:i+1,...w}))},{'Content-Disposition':'attachment; filename="journal-backup.json"'});
   }
   if(url.pathname==='/api/restore'&&req.method==='POST'){
    const body=await readBody(5242880);if(body.error)return json(body.error,{error:body.error===413?'백업 파일은 5MB 이하만 지원합니다.':'JSON 백업 파일을 확인해 주세요.'});
    const days=body.value?.journalDays,weeks=body.value?.journalWeeks??[];
    if(!Array.isArray(days)||!Array.isArray(weeks)||days.length+weeks.length>10000)return json(400,{error:'마케팅 일지 백업 파일이 아닙니다.'});
    const dates=new Set(),mondays=new Set();
    for(const d of days){if(!validDate(d?.date)||dates.has(d.date)||invalidTasks(d.tasks))return json(400,{error:'마케팅 일지 백업을 확인해 주세요.'});dates.add(d.date);}
    for(const w of weeks){if(!isMonday(w?.week_start)||mondays.has(w.week_start)||typeof w.focus!=='string'||w.focus.length>2000)return json(400,{error:'마케팅 일지 백업을 확인해 주세요.'});mondays.add(w.week_start);}
    const current=await readAll();
    if(current.days.length||current.weeks.length)return json(409,{error:'기존 데이터 보호를 위해 빈 일지에서만 복원할 수 있습니다.'});
    for(const d of days)await store.set('days/'+d.date,{date:d.date,tasks:d.tasks.map(t=>({text:t.text.trim(),done:t.done}))});
    for(const w of weeks)await store.set('weeks/'+w.week_start,{week_start:w.week_start,focus:w.focus});
    return json(200,{journalDays:days.length,journalWeeks:weeks.length});
   }
   return json(404,{error:'페이지를 찾을 수 없습니다.'});
  }catch{return json(500,{error:'저장 처리에 실패했습니다.'});}
 };
}

let handler;
export default async req=>{
 if(!handler){
  const {getStore}=await import('@netlify/blobs');
  const blobs=getStore({name:'marketing-journal',consistency:'strong'});
  handler=createHandler({
   keys:async prefix=>(await blobs.list({prefix})).blobs.map(b=>b.key),
   get:key=>blobs.get(key,{type:'json'}),
   set:(key,value)=>blobs.setJSON(key,value),
  });
 }
 return handler(req);
};

export const config={path:['/api/journal','/api/journal/*','/api/export','/api/restore']};
