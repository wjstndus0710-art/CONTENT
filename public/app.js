const $=id=>document.getElementById(id);
const channels=['네이버','홈페이지','티스토리','카카오','인스타'];
const channelStates=['','미작성','작성중','검수중','예약','발행완료'];
const fieldSets={publications:['콘텐츠 ID','사업부/서비스','채널','채널별 제목','타깃 키워드','콘텐츠 형태','발행 예정일','발행일','URL','상태'],keywords:['키워드','사업부/서비스','콘텐츠 ID','관련 콘텐츠','네이버 노출','Google 노출','AI 노출','기존 콘텐츠 여부','신규 작성 필요','최근 확인일']};
const titles={content:'멀티채널 운영 현황',calendar:'발행 캘린더',publications:'채널별 발행 관리',keywords:'멀티채널 키워드 관리',journal:'마케팅 일지'};
const weekdays=['월','화','수','목','금','토','일'];
const stored=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const remember=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
let items=[],records={publications:[],keywords:[]},journal={days:{},weeks:{}},editing=null,recordEditing=null,view=titles[stored('view')]?stored('view'):'content',focusDate=null;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function api(url,options){const res=await fetch(url,options);const data=await res.json();if(!res.ok)throw new Error(data.error||'요청에 실패했습니다.');return data;}
const addDays=(date,n)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const mondayOf=date=>addDays(date,-((new Date(date+'T00:00:00Z').getUTCDay()+6)%7));
let weekStart=mondayOf(today());
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function completed(c){return channels.filter(k=>c.metadata?.channel_statuses?.[k]==='발행완료').length;}
function actionButtons(tr,c,kind){const td=node('td');for(const [label,fn] of [['수정',()=>kind?openRecord(c):open(c)],['삭제',async()=>{if(!confirm('이 기록을 삭제할까요?'))return;try{await api(kind?`/api/records/${kind}/${c.id}`:'/api/content/'+c.id,{method:'DELETE'});await load();$('message').textContent='삭제했습니다.';}catch(e){$('message').textContent=e.message;}}]]){const b=node('button',label,'secondary');b.onclick=fn;td.append(b);}tr.append(td);}
function cell(tr,value){tr.append(node('td',value||'—'));}
function matches(c){const m=c.metadata||{};const text=[c.title,c.channel,m.business,m.main_keyword,m.sub_keywords,m.owner].join(' ').toLowerCase();return text.includes($('search').value.toLowerCase())&&(!$('business-filter').value||m.business===$('business-filter').value)&&(!$('filter').value||c.status===$('filter').value);}
function render(){
 $('total').textContent=items.length;$('working').textContent=items.filter(c=>completed(c)<5).length;$('done').textContent=items.filter(c=>c.status==='발행 완료').length;
 const start=today(),end=new Date(start+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+7);
 $('week').textContent=items.filter(c=>c.status!=='발행 완료'&&c.publish_date>=start&&c.publish_date<end.toISOString().slice(0,10)).length;
 $('view-title').textContent=titles[view];$('filter').hidden=!['content','calendar'].includes(view);$('business-filter').hidden=view==='journal';$('search').placeholder=view==='journal'?'일지 할 일 검색':'제목·키워드·담당자 검색';$('view-description').textContent=view==='journal'?'주간 목표와 요일별 할 일을 기록하고 완료한 일을 체크하세요.':view==='calendar'?'원문 발행일 기준 · 콘텐츠를 눌러 수정할 수 있습니다.':view==='content'?'채널별 완료율과 원본 진행률을 구분해 확인하세요.':'엑셀의 기존 기록을 확인하고 직접 추가·수정하세요. 숫자 38 등은 원본 값입니다.';
 $('add').textContent=view==='journal'?'＋ 오늘 할 일':view==='keywords'?'＋ 키워드 등록':view==='publications'?'＋ 채널 발행 등록':'＋ 콘텐츠 등록';
 $('table').hidden=['calendar','journal'].includes(view);$('journal').hidden=view!=='journal';$('calendar').hidden=view!=='calendar';$('calendar-tools').hidden=view!=='calendar';$('rows').replaceChildren();$('columns').replaceChildren();$('empty').hidden=true;
 if(view==='calendar'){renderCalendar();return;}
 if(view==='journal'){renderJournal();return;}
 const headings=view==='content'?['사업부 / 콘텐츠 주제','키워드 / 담당자','원문 채널 / 상태','원문 발행일','네이버','홈페이지','티스토리','카카오','인스타','5개 채널 완료율','엑셀 진행률','반복 주기','관리']: [...fieldSets[view],'관리'];
 const head=node('tr');headings.forEach(h=>head.append(node('th',h)));$('columns').append(head);
 const visible=view==='content'?items.filter(matches):records[view].filter(r=>Object.values(r.fields).join(' ').toLowerCase().includes($('search').value.toLowerCase())&&(!$('business-filter').value||r.fields['사업부/서비스']===$('business-filter').value));
 $('empty').hidden=visible.length>0;$('empty').querySelector('h3').textContent='표시할 기록이 없습니다';
 for(const c of visible){const tr=node('tr');if(view==='content'){
  const m=c.metadata||{},first=node('td');first.append(node('small',m.business||'사업부 미지정'),node('div',c.title));tr.append(first);
  const keys=node('td');keys.append(node('div',m.main_keyword||'—'),node('small',m.owner||'담당자 미지정'));tr.append(keys);
  const original=node('td');original.append(node('div',c.channel||'미지정'),node('span',c.status,'badge'));tr.append(original);cell(tr,c.publish_date);
  for(const channel of channels){const td=node('td');const state=m.channel_statuses?.[channel];td.append(node('span',state||'미입력','badge '+(state==='발행완료'?'complete':'')));tr.append(td);}
  cell(tr,`${completed(c)}/5 · ${completed(c)*20}%`);
  const p=Number(m.source_progress);cell(tr,m.source_progress!==undefined&&m.source_progress!==''&&Number.isFinite(p)?`${Math.round(p*100)}%`:'');cell(tr,c.cadence?`${c.cadence}일마다`:'미설정');actionButtons(tr,c);
 }else{for(const key of fieldSets[view])cell(tr,c.fields[key]);actionButtons(tr,c,view);}$('rows').append(tr);}
}
function renderCalendar(){
 const [year,month]=$('month').value.split('-').map(Number);const root=$('calendar');root.replaceChildren();for(const day of ['월','화','수','목','금','토','일'])root.append(node('div',day,'calendar-day'));
 const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;const days=new Date(Date.UTC(year,month,0)).getUTCDate();const filtered=items.filter(matches);
 for(let i=0;i<Math.ceil((offset+days)/7)*7;i++){const d=i-offset+1,box=node('div',undefined,'calendar-cell');if(d>0&&d<=days){const date=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;box.append(node('strong',String(d)));if(date===today())box.classList.add('today');for(const c of filtered.filter(c=>c.publish_date===date)){const b=node('button',`${c.metadata?.business||''} ${c.title}`,'calendar-item');b.title=c.title+' · '+c.status;b.onclick=()=>open(c);box.append(b);}}else box.classList.add('outside');root.append(box);}
}
function taskItem(date,tasks,index){
 const t=tasks[index],li=node('li',undefined,t.done?'done':''),box=node('input'),text=node('span',t.text,'text'),remove=node('button','×','remove');
 box.type='checkbox';box.checked=t.done;box.setAttribute('aria-label',t.text+' 완료');box.onchange=()=>saveDay(date,tasks.map((x,i)=>i===index?{...x,done:box.checked}:x));
 text.title='눌러서 수정';text.onclick=()=>{const input=node('input');input.type='text';input.value=t.text;input.maxLength=500;let finished=false;
  const finish=commit=>{if(finished)return;finished=true;const value=input.value.trim();if(!commit||value===t.text){renderJournal();return;}saveDay(date,value?tasks.map((x,i)=>i===index?{...x,text:value}:x):tasks.filter((x,i)=>i!==index));};
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();finish(true);}if(e.key==='Escape')finish(false);};input.onblur=()=>finish(true);text.replaceWith(input);input.focus();};
 remove.setAttribute('aria-label',t.text+' 삭제');remove.onclick=()=>saveDay(date,tasks.filter((x,i)=>i!==index));
 li.append(box,text,remove);return li;
}
function renderJournal(){
 const query=$('search').value.trim().toLowerCase();$('journal-days').hidden=!!query;$('week-focus').parentElement.hidden=!!query;$('journal-results').hidden=!query;
 if(query){
  $('journal-results').replaceChildren();let found=0;
  for(const date of Object.keys(journal.days).sort().reverse()){const hits=journal.days[date].filter(t=>t.text.toLowerCase().includes(query));if(!hits.length)continue;found+=hits.length;
   $('journal-results').append(node('h3',`${date} (${weekdays[(new Date(date+'T00:00:00Z').getUTCDay()+6)%7]})`));const ul=node('ul',undefined,'tasks');
   for(const t of hits){const li=node('li',(t.done?'✓ ':'')+t.text,t.done?'done':'');li.title='이 주로 이동';li.onclick=()=>{$('search').value='';weekStart=mondayOf(date);render();};ul.append(li);}$('journal-results').append(ul);}
  if(!found)$('journal-results').append(node('p','검색 결과가 없습니다.'));
  $('week-progress').textContent=`검색 결과 ${found}건`;return;
 }
 const end=addDays(weekStart,6),[y,m,d]=weekStart.split('-').map(Number),[,m2,d2]=end.split('-').map(Number);
 $('week-label').textContent=`${y}년 ${m}월 ${d}일 – ${m2}월 ${d2}일`;
 const weekend=$('show-weekend').checked||[5,6].some(i=>journal.days[addDays(weekStart,i)]?.length);
 const dates=Array.from({length:weekend?7:5},(_,i)=>addDays(weekStart,i));
 const all=dates.flatMap(date=>journal.days[date]||[]);$('week-progress').textContent=all.length?`이번 주 완료 ${all.filter(t=>t.done).length} / ${all.length}`:'아직 기록이 없습니다';
 if(document.activeElement!==$('week-focus'))$('week-focus').value=journal.weeks[weekStart]||'';
 const grid=$('journal-days');grid.replaceChildren();grid.classList.toggle('weekend',weekend);
 dates.forEach((date,i)=>{
  const tasks=journal.days[date]||[],card=node('section',undefined,'day-card'+(date===today()?' today':'')),title=node('h3',`${Number(date.slice(5,7))}/${Number(date.slice(8))} (${weekdays[i]})`);
  if(date===today())title.append(node('small','오늘'));const ul=node('ul',undefined,'tasks');tasks.forEach((_,index)=>ul.append(taskItem(date,tasks,index)));
  const add=node('input',undefined,'add');add.placeholder='할 일 입력 후 Enter';add.maxLength=500;add.dataset.date=date;add.setAttribute('aria-label',`${date} 할 일 추가`);
  add.onkeydown=e=>{if(e.key!=='Enter'||e.isComposing||!add.value.trim())return;e.preventDefault();if(tasks.length>=100){$('message').textContent='하루 할 일은 100개까지 기록할 수 있습니다.';return;}focusDate=date;saveDay(date,[...tasks,{text:add.value.trim(),done:false}]);};
  card.append(title,ul,add);grid.append(card);
 });
 if(focusDate){grid.querySelector(`input.add[data-date="${focusDate}"]`)?.focus();focusDate=null;}
}
async function saveDay(date,tasks){
 const previous=journal.days[date];journal.days[date]=tasks;renderJournal();
 try{await api('/api/journal/days/'+date,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({tasks})});$('message').textContent='';}
 catch(e){if(previous)journal.days[date]=previous;else delete journal.days[date];renderJournal();$('message').textContent=e.message;}
}
async function load(){const result=await Promise.all([api('/api/content'),api('/api/records/publications'),api('/api/records/keywords'),api('/api/import-summary'),api('/api/journal')]);[items,records.publications,records.keywords]=result;
 journal={days:Object.fromEntries(result[4].days.map(d=>[d.date,d.tasks])),weeks:Object.fromEntries(result[4].weeks.map(w=>[w.week_start,w.focus]))};
 $('import-info').textContent=result[3].length?`가져온 파일: ${result[3].map(s=>s.filename).join(', ')} · 사본·자동 연동 캘린더는 중복 등록하지 않았습니다.`:'';
 const current=$('business-filter').value;const businesses=[...new Set([...items.map(c=>c.metadata?.business),...Object.values(records).flat().map(r=>r.fields['사업부/서비스'])].filter(Boolean))].sort();$('business-filter').replaceChildren(new Option('모든 사업부',''));$('business-options').replaceChildren();for(const b of businesses){$('business-filter').append(new Option(b,b));$('business-options').append(new Option(b,b));}if(businesses.includes(current))$('business-filter').value=current;render();}
for(const channel of channels){const label=node('label',channel),select=node('select');select.name='channel_'+channel;for(const status of channelStates)select.append(new Option(status||'미입력',status));label.append(select);$('channel-fields').append(label);}
function open(c){editing=c?.id??null;$('form').reset();$('form-title').textContent=c?'콘텐츠 수정':'콘텐츠 등록';$('form-error').textContent='';$('form').elements.publish_date.value=today();if(c){for(const name of ['title','channel','status','publish_date','cadence','notes'])$('form').elements[name].value=c[name];for(const name of ['business','owner','main_keyword','naver_exposure','sub_keywords'])$('form').elements[name].value=c.metadata?.[name]||'';for(const channel of channels)$('form').elements['channel_'+channel].value=c.metadata?.channel_statuses?.[channel]||'';}$('editor').showModal();}
function openRecord(c){recordEditing=c?.id??null;$('record-title').textContent=titles[view]+(c?' 수정':' 등록');$('record-error').textContent='';$('record-fields').replaceChildren();for(const key of fieldSets[view]){const label=node('label',key);const input=node('input');input.name=key;input.maxLength=2000;input.value=c?.fields[key]||'';if(['발행 예정일','발행일','최근 확인일'].includes(key))input.type='date';input.required=key===(view==='publications'?'채널별 제목':'키워드');label.append(input);$('record-fields').append(label);}$('record-editor').showModal();}
$('add').onclick=()=>{if(view!=='journal')return fieldSets[view]?openRecord():open();$('search').value='';weekStart=mondayOf(today());focusDate=today();render();};
$('prev-week').onclick=()=>{weekStart=addDays(weekStart,-7);renderJournal();};$('next-week').onclick=()=>{weekStart=addDays(weekStart,7);renderJournal();};$('this-week').onclick=()=>{weekStart=mondayOf(today());renderJournal();};
$('show-weekend').checked=stored('show-weekend')==='1';$('show-weekend').onchange=()=>{remember('show-weekend',$('show-weekend').checked?'1':'0');renderJournal();};
$('week-focus').onchange=async()=>{const week=weekStart,focus=$('week-focus').value;try{await api('/api/journal/weeks/'+week,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({focus})});journal.weeks[week]=focus;$('message').textContent='주간 목표를 저장했습니다.';}catch(e){$('message').textContent=e.message;}};$('close').onclick=()=>$('editor').close();$('record-close').onclick=()=>$('record-editor').close();$('search').oninput=render;$('filter').onchange=render;$('business-filter').onchange=render;
for(const b of document.querySelectorAll('[data-view]')){b.setAttribute('aria-pressed',String(b.dataset.view===view));b.onclick=()=>{view=b.dataset.view;remember('view',view);document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));$('message').textContent='';render();};}
$('month').value=today().slice(0,7);$('month').onchange=()=>{if(!$('month').value)$('month').value=today().slice(0,7);render();};
function shiftMonth(n){const [y,m]=$('month').value.split('-').map(Number);$('month').value=new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);render();}$('prev-month').onclick=()=>shiftMonth(-1);$('next-month').onclick=()=>shiftMonth(1);
$('form').onsubmit=async event=>{event.preventDefault();const fields=Object.fromEntries(new FormData(event.target));const data={};for(const k of ['title','channel','status','publish_date','notes'])data[k]=fields[k];data.cadence=Number(fields.cadence);data.metadata={};for(const k of ['business','owner','main_keyword','naver_exposure','sub_keywords'])data.metadata[k]=fields[k];data.metadata.channel_statuses=Object.fromEntries(channels.map(k=>[k,fields['channel_'+k]]));$('save').disabled=true;$('form-error').textContent='';try{await api('/api/content'+(editing?'/'+editing:''),{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});$('editor').close();await load();$('message').textContent='저장했습니다.';}catch(e){$('form-error').textContent=e.message;}finally{$('save').disabled=false;}};
$('record-form').onsubmit=async event=>{event.preventDefault();$('record-save').disabled=true;$('record-error').textContent='';try{await api(`/api/records/${view}`+(recordEditing?'/'+recordEditing:''),{method:recordEditing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});$('record-editor').close();await load();$('message').textContent='저장했습니다.';}catch(e){$('record-error').textContent=e.message;}finally{$('record-save').disabled=false;}};
load().catch(e=>{$('message').textContent='기록을 불러오지 못했습니다. '+e.message;});

$('restore').onclick=()=>$('restore-file').click();
$('restore-file').onchange=async()=>{const file=$('restore-file').files[0];if(!file)return;try{if(file.size>5242880)throw new Error('5MB 이하의 JSON 백업 파일을 선택해 주세요.');if(!confirm('빈 서버에 백업을 복원합니다. 기존 데이터가 있으면 복원하지 않습니다. 진행할까요?'))return;await api('/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:await file.text()});await load();$('message').textContent='백업을 복원했습니다.';}catch(e){$('message').textContent=e.message;}finally{$('restore-file').value='';}};
