const $=id=>document.getElementById(id);
const weekdays=['월','화','수','목','금','토','일'];
const stored=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const remember=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays=(date,n)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const dayIndex=date=>(new Date(date+'T00:00:00Z').getUTCDay()+6)%7;
const mondayOf=date=>addDays(date,-dayIndex(date));
const short=date=>`${Number(date.slice(5,7))}/${Number(date.slice(8))}`;
let journal={days:{},weeks:{}},weekStart=mondayOf(today()),month=today().slice(0,7),focusDate=null;
// Netlify serves the page publicly, so the API login is kept here and sent with every request.
const TOKEN_KEY='journal-auth';
const readToken=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY);}catch{return null;}};
const writeToken=(token,remember)=>{try{sessionStorage.removeItem(TOKEN_KEY);localStorage.removeItem(TOKEN_KEY);if(token)(remember?localStorage:sessionStorage).setItem(TOKEN_KEY,token);}catch{}};
let token=readToken();
class AuthError extends Error{}
async function api(url,options={}){
 const headers={...(options.headers||{})};if(token)headers.Authorization='Basic '+token;
 const res=await fetch(url,{...options,headers});let data={};try{data=await res.json();}catch{}
 if(res.status===401)throw new AuthError(data.error||'로그인이 필요합니다.');
 if(!res.ok)throw new Error(data.error||'요청에 실패했습니다.');return data;
}
// Anyone may read the journal; changes need a login (canEdit).
let canEdit=false;
function setEditable(value){canEdit=value;document.body.classList.toggle('readonly',!canEdit);$('week-focus').readOnly=!canEdit;$('login-open').hidden=canEdit;$('logout').hidden=!(canEdit&&token);render();}
async function checkSession(){try{await api('/api/session');return true;}catch(e){if(e instanceof AuthError)return false;throw e;}}
function showLogin(message){$('login').hidden=false;$('login-error').textContent=message||'';$('login-password').value='';$('login-password').focus();}
const put=(url,value)=>api(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
const tasksOf=date=>journal.days[date]||[];
const showWeekend=()=>$('show-weekend').checked||[5,6].some(i=>tasksOf(addDays(weekStart,i)).length);
const nextWorkday=date=>{let next=addDays(date,1);while(!showWeekend()&&dayIndex(next)>4)next=addDays(next,1);return next;};

function renderSummary(){
 const t=today(),[y,m,d]=t.split('-').map(Number),mine=tasksOf(t),left=mine.filter(x=>!x.done).length;
 $('today-title').textContent=`${m}월 ${d}일 ${weekdays[dayIndex(t)]}요일`;
 $('today-summary').textContent=mine.length?(left?`오늘 할 일 ${mine.length}개 중 ${left}개가 남았어요.`:'오늘 할 일을 모두 끝냈어요.'):'오늘은 아직 기록이 없어요. 할 일을 적어 보세요.';
 $('stat-today').textContent=left;$('stat-today-sub').textContent=`완료 ${mine.length-left} / 전체 ${mine.length}`;
 const week=Array.from({length:7},(_,i)=>tasksOf(addDays(weekStart,i))).flat(),done=week.filter(x=>x.done).length,rate=week.length?Math.round(done/week.length*100):0;
 $('stat-week').textContent=rate+'%';$('stat-week-bar').style.width=rate+'%';
 const monthTasks=Object.entries(journal.days).filter(([date])=>date.startsWith(t.slice(0,7))).flatMap(([,x])=>x);
 $('stat-month').textContent=monthTasks.filter(x=>x.done).length;$('stat-month-sub').textContent=`${y}년 ${m}월 · 기록 ${Object.keys(journal.days).filter(x=>x.startsWith(t.slice(0,7))).length}일`;
 $('stat-overdue').textContent=Array.from({length:7},(_,i)=>tasksOf(addDays(t,-(i+1)))).flat().filter(x=>!x.done).length;
}
function renderWeekHead(){
 const end=addDays(weekStart,6),[y,m,d]=weekStart.split('-').map(Number);
 $('week-label').textContent=`${y}년 ${m}월 ${d}일 – ${short(end)}`;
 if(document.activeElement!==$('week-focus'))$('week-focus').value=journal.weeks[weekStart]||'';
}
function renderMiniCalendar(){
 const [y,m]=month.split('-').map(Number),first=`${month}-01`,days=new Date(Date.UTC(y,m,0)).getUTCDate(),offset=dayIndex(first),grid=$('mini-grid');
 $('month-label').textContent=`${y}년 ${m}월`;grid.replaceChildren(...weekdays.map(w=>node('span',w,'mini-day')));
 for(let i=0;i<offset;i++)grid.append(node('span'));
 for(let d=1;d<=days;d++){const date=`${month}-${String(d).padStart(2,'0')}`,tasks=tasksOf(date),b=node('button',String(d),'mini-date');
  if(date===today())b.classList.add('today');if(mondayOf(date)===weekStart)b.classList.add('in-week');
  if(tasks.length)b.classList.add(tasks.every(x=>x.done)?'has-done':'has-open');
  b.setAttribute('aria-label',`${m}월 ${d}일${tasks.length?` 할 일 ${tasks.length}개`:''}`);b.onclick=()=>{weekStart=mondayOf(date);render();};grid.append(b);}
}
function taskItem(date,tasks,index){
 const t=tasks[index],li=node('li',undefined,t.done?'done':''),box=node('input'),text=node('span',t.text,'text'),actions=node('span',undefined,'task-actions');
 box.type='checkbox';box.checked=t.done;box.disabled=!canEdit;box.setAttribute('aria-label',t.text+' 완료');box.onchange=()=>saveDay(date,tasks.map((x,i)=>i===index?{...x,done:box.checked}:x));
 if(canEdit)text.title='눌러서 수정';text.onclick=()=>{if(!canEdit)return;const input=node('input');input.type='text';input.value=t.text;input.maxLength=500;let finished=false;
  const finish=commit=>{if(finished)return;finished=true;const value=input.value.trim();if(!commit||value===t.text){render();return;}saveDay(date,value?tasks.map((x,i)=>i===index?{...x,text:value}:x):tasks.filter((x,i)=>i!==index));};
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();finish(true);}if(e.key==='Escape')finish(false);};input.onblur=()=>finish(true);text.replaceWith(input);input.focus();};
 if(!t.done){const move=node('button','→','icon');const next=nextWorkday(date);move.title=`${short(next)}로 넘기기`;move.setAttribute('aria-label',`${t.text} ${short(next)}로 넘기기`);move.onclick=()=>moveTask(date,index,next);actions.append(move);}
 const remove=node('button','×','icon remove');remove.setAttribute('aria-label',t.text+' 삭제');remove.onclick=()=>saveDay(date,tasks.filter((x,i)=>i!==index));actions.append(remove);
 li.append(box,text,actions);return li;
}
function renderBoard(){
 const query=$('search').value.trim().toLowerCase();$('journal-days').hidden=!!query;$('journal-results').hidden=!query;
 if(query){
  const results=$('journal-results');results.replaceChildren();let found=0;
  for(const date of Object.keys(journal.days).sort().reverse()){const hits=journal.days[date].filter(t=>t.text.toLowerCase().includes(query));if(!hits.length)continue;found+=hits.length;
   results.append(node('h3',`${date} (${weekdays[dayIndex(date)]})`));const ul=node('ul',undefined,'tasks');
   for(const t of hits){const li=node('li',(t.done?'✓ ':'')+t.text,t.done?'done':'');li.title='이 주로 이동';li.tabIndex=0;li.onclick=li.onkeydown=e=>{if(e.type==='keydown'&&e.key!=='Enter')return;$('search').value='';weekStart=mondayOf(date);render();};ul.append(li);}results.append(ul);}
  results.prepend(node('p',found?`검색 결과 ${found}건 · 누르면 그 주로 이동합니다.`:'검색 결과가 없습니다.','hint'));return;
 }
 const weekend=showWeekend(),grid=$('journal-days');grid.replaceChildren();grid.classList.toggle('weekend',weekend);
 Array.from({length:weekend?7:5},(_,i)=>addDays(weekStart,i)).forEach((date,i)=>{
  const tasks=tasksOf(date),card=node('section',undefined,'day-card'+(date===today()?' today':'')+(date<today()?' past':'')),head=node('div',undefined,'day-head'),title=node('h3',`${short(date)} (${weekdays[i]})`);
  head.append(title);if(date===today())head.append(node('span','오늘','pill'));
  else if(tasks.some(t=>!t.done)&&date<today()){const all=node('button','모두 완료','link');all.onclick=()=>saveDay(date,tasks.map(t=>({...t,done:true})));head.append(all);}
  const ul=node('ul',undefined,'tasks');tasks.forEach((_,index)=>ul.append(taskItem(date,tasks,index)));
  const add=node('input',undefined,'add');add.placeholder='할 일 입력 후 Enter';add.maxLength=500;add.dataset.date=date;add.setAttribute('aria-label',`${date} 할 일 추가`);
  add.onkeydown=e=>{if(e.key!=='Enter'||e.isComposing||!add.value.trim())return;e.preventDefault();if(tasks.length>=100){$('message').textContent='하루 할 일은 100개까지 기록할 수 있습니다.';return;}focusDate=date;saveDay(date,[...tasks,{text:add.value.trim(),done:false}]);};
  card.append(head,ul,add);grid.append(card);
 });
 if(focusDate){grid.querySelector(`input.add[data-date="${focusDate}"]`)?.focus();focusDate=null;}
}
function render(){const [y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);if(weekStart>last||addDays(weekStart,6)<`${month}-01`)month=addDays(weekStart,3).slice(0,7);renderSummary();renderWeekHead();renderMiniCalendar();renderBoard();}
async function saveDay(date,tasks){
 const previous=journal.days[date];journal.days[date]=tasks;render();
 try{await put('/api/journal/days/'+date,{tasks});$('message').textContent='';}
 catch(e){if(previous)journal.days[date]=previous;else delete journal.days[date];render();if(e instanceof AuthError)showLogin(e.message);else $('message').textContent=e.message;}
}
async function moveTask(date,index,next){
 const from=tasksOf(date),task=from[index];if(tasksOf(next).length>=100){$('message').textContent='다음 날 할 일이 100개라 넘길 수 없습니다.';return;}
 await saveDay(next,[...tasksOf(next),task]);await saveDay(date,from.filter((x,i)=>i!==index));$('message').textContent=`‘${task.text}’를 ${short(next)}로 넘겼습니다.`;
}
async function load(){const data=await api('/api/journal');journal={days:Object.fromEntries(data.days.map(d=>[d.date,d.tasks])),weeks:Object.fromEntries(data.weeks.map(w=>[w.week_start,w.focus]))};render();}
$('add').onclick=()=>{if(!canEdit)return showLogin();$('search').value='';weekStart=mondayOf(today());focusDate=today();render();};
$('prev-week').onclick=()=>{weekStart=addDays(weekStart,-7);render();};$('next-week').onclick=()=>{weekStart=addDays(weekStart,7);render();};$('this-week').onclick=()=>{weekStart=mondayOf(today());month=today().slice(0,7);render();};
const shiftMonth=n=>{const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);renderMiniCalendar();};
$('prev-month').onclick=()=>shiftMonth(-1);$('next-month').onclick=()=>shiftMonth(1);
$('search').oninput=renderBoard;
$('show-weekend').checked=stored('show-weekend')==='1';$('show-weekend').onchange=()=>{remember('show-weekend',$('show-weekend').checked?'1':'0');render();};
$('week-focus').onchange=async()=>{const week=weekStart,focus=$('week-focus').value;try{await put('/api/journal/weeks/'+week,{focus});journal.weeks[week]=focus;$('focus-status').textContent='저장했습니다.';}catch(e){$('focus-status').textContent=e.message;}};
$('week-focus').oninput=()=>{$('focus-status').textContent='입력 칸 밖을 누르면 저장됩니다.';};
$('restore').onclick=()=>$('restore-file').click();
$('restore-file').onchange=async()=>{const file=$('restore-file').files[0];if(!file)return;try{if(file.size>5242880)throw new Error('5MB 이하의 JSON 백업 파일을 선택해 주세요.');if(!confirm('빈 서버에 백업을 복원합니다. 기존 데이터가 있으면 복원하지 않습니다. 진행할까요?'))return;await api('/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:await file.text()});await load();$('message').textContent='백업을 복원했습니다.';}catch(e){if(e instanceof AuthError)showLogin(e.message);else $('message').textContent=e.message;}finally{$('restore-file').value='';}};
const start=async()=>{
 try{await load();}catch(e){if(e instanceof AuthError)return showLogin();$('message').textContent='일지를 불러오지 못했습니다. '+e.message;return;}
 try{const ok=await checkSession();if(!ok&&token){token=null;writeToken(null);}setEditable(ok);}catch{setEditable(false);}
};
$('login-open').onclick=()=>showLogin();$('login-close').onclick=()=>{$('login').hidden=true;};
$('login-form').onsubmit=async event=>{event.preventDefault();const user=$('login-user').value.trim(),password=$('login-password').value;
 token=btoa(String.fromCharCode(...new TextEncoder().encode(user+':'+password)));$('login-submit').disabled=true;$('login-error').textContent='';
 try{if(!await checkSession())throw new AuthError();writeToken(token,$('login-remember').checked);$('login').hidden=true;await load();setEditable(true);$('message').textContent='로그인했습니다. 이제 일지를 수정할 수 있습니다.';}catch(e){token=null;$('login-error').textContent=e instanceof AuthError?'아이디 또는 비밀번호가 맞지 않습니다.':e.message;}finally{$('login-submit').disabled=false;}};
$('logout').onclick=()=>{token=null;writeToken(null);setEditable(false);$('message').textContent='로그아웃했습니다. 보기만 할 수 있습니다.';};
$('export').onclick=async()=>{try{const data=await api('/api/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=node('a');a.href=url;a.download=`journal-backup-${today()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(e instanceof AuthError)showLogin(e.message);else $('message').textContent=e.message;}};
start();
