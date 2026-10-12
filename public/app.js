const $=id=>document.getElementById(id);
const channels=['네이버','홈페이지','티스토리','카카오','인스타'];
const channelStates=['','미작성','작성중','검수중','예약','발행완료'];
const fieldSets={publications:['콘텐츠 ID','사업부/서비스','채널','채널별 제목','타깃 키워드','콘텐츠 형태','발행 예정일','발행일','URL','상태'],keywords:['키워드','사업부/서비스','콘텐츠 ID','관련 콘텐츠','네이버 노출','Google 노출','AI 노출','기존 콘텐츠 여부','신규 작성 필요','최근 확인일']};
const titles={content:'멀티채널 운영 현황',calendar:'발행 캘린더',publications:'채널별 발행 관리',keywords:'멀티채널 키워드 관리'};
let items=[],records={publications:[],keywords:[]},editing=null,recordEditing=null,view='content';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function api(url,options){const res=await fetch(url,options);const data=await res.json();if(!res.ok)throw new Error(data.error||'요청에 실패했습니다.');return data;}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function completed(c){return channels.filter(k=>c.metadata?.channel_statuses?.[k]==='발행완료').length;}
function actionButtons(tr,c,kind){const td=node('td');for(const [label,fn] of [['수정',()=>kind?openRecord(c):open(c)],['삭제',async()=>{if(!confirm('이 기록을 삭제할까요?'))return;try{await api(kind?`/api/records/${kind}/${c.id}`:'/api/content/'+c.id,{method:'DELETE'});await load();$('message').textContent='삭제했습니다.';}catch(e){$('message').textContent=e.message;}}]]){const b=node('button',label,'secondary');b.onclick=fn;td.append(b);}tr.append(td);}
function cell(tr,value){tr.append(node('td',value||'—'));}
function matches(c){const m=c.metadata||{};const text=[c.title,c.channel,m.business,m.main_keyword,m.sub_keywords,m.owner].join(' ').toLowerCase();return text.includes($('search').value.toLowerCase())&&(!$('business-filter').value||m.business===$('business-filter').value)&&(!$('filter').value||c.status===$('filter').value);}
function render(){
 $('total').textContent=items.length;$('working').textContent=items.filter(c=>completed(c)<5).length;$('done').textContent=items.filter(c=>c.status==='발행 완료').length;
 const start=today(),end=new Date(start+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+7);
 $('week').textContent=items.filter(c=>c.status!=='발행 완료'&&c.publish_date>=start&&c.publish_date<end.toISOString().slice(0,10)).length;
 $('view-title').textContent=titles[view];$('filter').hidden=!['content','calendar'].includes(view);$('view-description').textContent=view==='calendar'?'원문 발행일 기준 · 콘텐츠를 눌러 수정할 수 있습니다.':view==='content'?'채널별 완료율과 원본 진행률을 구분해 확인하세요.':'엑셀의 기존 기록을 확인하고 직접 추가·수정하세요. 숫자 38 등은 원본 값입니다.';
 $('add').textContent=view==='keywords'?'＋ 키워드 등록':view==='publications'?'＋ 채널 발행 등록':'＋ 콘텐츠 등록';
 $('table').hidden=view==='calendar';$('calendar').hidden=view!=='calendar';$('calendar-tools').hidden=view!=='calendar';$('rows').replaceChildren();$('columns').replaceChildren();$('empty').hidden=true;
 if(view==='calendar'){renderCalendar();return;}
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
async function load(){const result=await Promise.all([api('/api/content'),api('/api/records/publications'),api('/api/records/keywords'),api('/api/import-summary')]);[items,records.publications,records.keywords]=result;
 $('import-info').textContent=result[3].length?`가져온 파일: ${result[3].map(s=>s.filename).join(', ')} · 사본·자동 연동 캘린더는 중복 등록하지 않았습니다.`:'';
 const current=$('business-filter').value;const businesses=[...new Set([...items.map(c=>c.metadata?.business),...Object.values(records).flat().map(r=>r.fields['사업부/서비스'])].filter(Boolean))].sort();$('business-filter').replaceChildren(new Option('모든 사업부',''));$('business-options').replaceChildren();for(const b of businesses){$('business-filter').append(new Option(b,b));$('business-options').append(new Option(b,b));}if(businesses.includes(current))$('business-filter').value=current;render();}
for(const channel of channels){const label=node('label',channel),select=node('select');select.name='channel_'+channel;for(const status of channelStates)select.append(new Option(status||'미입력',status));label.append(select);$('channel-fields').append(label);}
function open(c){editing=c?.id??null;$('form').reset();$('form-title').textContent=c?'콘텐츠 수정':'콘텐츠 등록';$('form-error').textContent='';$('form').elements.publish_date.value=today();if(c){for(const name of ['title','channel','status','publish_date','cadence','notes'])$('form').elements[name].value=c[name];for(const name of ['business','owner','main_keyword','naver_exposure','sub_keywords'])$('form').elements[name].value=c.metadata?.[name]||'';for(const channel of channels)$('form').elements['channel_'+channel].value=c.metadata?.channel_statuses?.[channel]||'';}$('editor').showModal();}
function openRecord(c){recordEditing=c?.id??null;$('record-title').textContent=titles[view]+(c?' 수정':' 등록');$('record-error').textContent='';$('record-fields').replaceChildren();for(const key of fieldSets[view]){const label=node('label',key);const input=node('input');input.name=key;input.maxLength=2000;input.value=c?.fields[key]||'';if(['발행 예정일','발행일','최근 확인일'].includes(key))input.type='date';input.required=key===(view==='publications'?'채널별 제목':'키워드');label.append(input);$('record-fields').append(label);}$('record-editor').showModal();}
$('add').onclick=()=>fieldSets[view]?openRecord():open();$('close').onclick=()=>$('editor').close();$('record-close').onclick=()=>$('record-editor').close();$('search').oninput=render;$('filter').onchange=render;$('business-filter').onchange=render;
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));render();};
$('month').value=today().slice(0,7);$('month').onchange=()=>{if(!$('month').value)$('month').value=today().slice(0,7);render();};
function shiftMonth(n){const [y,m]=$('month').value.split('-').map(Number);$('month').value=new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);render();}$('prev-month').onclick=()=>shiftMonth(-1);$('next-month').onclick=()=>shiftMonth(1);
$('form').onsubmit=async event=>{event.preventDefault();const fields=Object.fromEntries(new FormData(event.target));const data={};for(const k of ['title','channel','status','publish_date','notes'])data[k]=fields[k];data.cadence=Number(fields.cadence);data.metadata={};for(const k of ['business','owner','main_keyword','naver_exposure','sub_keywords'])data.metadata[k]=fields[k];data.metadata.channel_statuses=Object.fromEntries(channels.map(k=>[k,fields['channel_'+k]]));$('save').disabled=true;$('form-error').textContent='';try{await api('/api/content'+(editing?'/'+editing:''),{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});$('editor').close();await load();$('message').textContent='저장했습니다.';}catch(e){$('form-error').textContent=e.message;}finally{$('save').disabled=false;}};
$('record-form').onsubmit=async event=>{event.preventDefault();$('record-save').disabled=true;$('record-error').textContent='';try{await api(`/api/records/${view}`+(recordEditing?'/'+recordEditing:''),{method:recordEditing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});$('record-editor').close();await load();$('message').textContent='저장했습니다.';}catch(e){$('record-error').textContent=e.message;}finally{$('record-save').disabled=false;}};
load().catch(e=>{$('message').textContent='기록을 불러오지 못했습니다. '+e.message;});

$('restore').onclick=()=>$('restore-file').click();
$('restore-file').onchange=async()=>{const file=$('restore-file').files[0];if(!file)return;try{if(file.size>5242880)throw new Error('5MB 이하의 JSON 백업 파일을 선택해 주세요.');if(!confirm('빈 서버에 백업을 복원합니다. 기존 데이터가 있으면 복원하지 않습니다. 진행할까요?'))return;await api('/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:await file.text()});await load();$('message').textContent='백업을 복원했습니다.';}catch(e){$('message').textContent=e.message;}finally{$('restore-file').value='';}};
