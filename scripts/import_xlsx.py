"""Import the user's workbook without running formulas or overwriting existing records."""
import argparse, datetime, hashlib, json, pathlib, sqlite3, subprocess, zipfile
import xml.etree.ElementTree as ET
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'

def read_workbook(source):
 with zipfile.ZipFile(source) as z:
  strings=[]
  if 'xl/sharedStrings.xml' in z.namelist():
   strings=[''.join(t.text or '' for t in si.findall('.//m:t',NS)) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',NS)]
  targets={r.get('Id'):r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
  sheets={}
  for sheet in ET.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet',NS):
   target=targets[sheet.get(REL)]; name=target.lstrip('/') if target.startswith('/') else 'xl/'+target
   rows=[]
   for row in ET.fromstring(z.read(name)).findall('.//m:sheetData/m:row',NS):
    values={}
    for c in row.findall('m:c',NS):
     v=c.find('m:v',NS);value=v.text or '' if v is not None else ''.join(t.text or '' for t in c.findall('.//m:t',NS))
     if c.get('t')=='s' and value:value=strings[int(value)]
     if value:values[''.join(ch for ch in c.get('r') if ch.isalpha())]=value
    if values:rows.append({'row':int(row.get('r')),'values':values})
   sheets[sheet.get('name')]=rows
  return sheets

def excel_date(value):
 if not value:return ''
 try:return (datetime.datetime(1899,12,30)+datetime.timedelta(days=float(value))).date().isoformat()
 except ValueError:return value

def import_file(source,data_dir):
 source=pathlib.Path(source); data_dir=pathlib.Path(data_dir);data_dir.mkdir(parents=True,exist_ok=True)
 sheets=read_workbook(source); digest=hashlib.sha256(source.read_bytes()).hexdigest()
 subprocess.run(['node',str(pathlib.Path(__file__).with_name('init-db.js')),str(data_dir)],check=True)
 db=sqlite3.connect(data_dir/'content.sqlite');db.execute('PRAGMA foreign_keys=ON')
 if not db.execute('SELECT 1 FROM import_sources WHERE sha256=?',(digest,)).fetchone():
  backups=data_dir/'backups';backups.mkdir(exist_ok=True)
  backup=sqlite3.connect(backups/('before-import-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')+'.sqlite'))
  db.backup(backup);backup.close()
 report={'content':0,'publications':0,'keywords':0,'skipped':0,'source':source.name,'sha256':digest}
 with db:
  for row in sheets['멀티채널 콘텐츠 운영 현황']:
   v=row['values']
   if row['row']<4 or not v.get('B','').strip():continue
   key='content:'+digest+':'+str(row['row'])
   if db.execute('SELECT 1 FROM import_items WHERE source_key=?',(key,)).fetchone():report['skipped']+=1;continue
   channels={label:v.get(col,'') for col,label in [('H','네이버'),('I','홈페이지'),('J','티스토리'),('K','카카오'),('L','인스타')]}
   primary=v.get('F','');primary_state=channels['네이버'] if primary=='네이버 블로그' else ''
   status={'발행완료':'발행 완료','작성중':'제작 중','예약':'발행 예정','미작성':'아이디어'}.get(primary_state,'발행 확인 필요')
   metadata={'business':v.get('A',''),'main_keyword':v.get('C',''),'naver_exposure':v.get('D',''),'sub_keywords':v.get('E',''),'owner':v.get('N',''),'channel_statuses':channels,'source_progress':v.get('M',''),'source_sheet':'멀티채널 콘텐츠 운영 현황','source_row':row['row']}
   cur=db.execute('INSERT INTO content(title,channel,status,publish_date,cadence,notes,metadata) VALUES(?,?,?,?,?,?,?)',(v['B'],primary,status,excel_date(v.get('G','')),0,v.get('O',''),json.dumps(metadata,ensure_ascii=False)))
   db.execute('INSERT INTO import_items VALUES(?,?,?)',(key,'content',cur.lastrowid));report['content']+=1
  for sheet,kind in [('채널별 발행 관리','publications'),('멀티채널 키워드 관리','keywords')]:
   header=next(r['values'] for r in sheets[sheet] if r['row']==3)
   for row in sheets[sheet]:
    if row['row']<4:continue
    v=row['values'];key=kind+':'+digest+':'+str(row['row'])
    if db.execute('SELECT 1 FROM import_items WHERE source_key=?',(key,)).fetchone():report['skipped']+=1;continue
    fields={label:v.get(col,'') for col,label in header.items()}
    for label in ['발행 예정일','발행일','최근 확인일']:
     if label in fields:fields[label]=excel_date(fields[label])
    cur=db.execute('INSERT INTO records(kind,fields) VALUES(?,?)',(kind,json.dumps(fields,ensure_ascii=False)))
    db.execute('INSERT INTO import_items VALUES(?,?,?)',(key,kind,cur.lastrowid));report[kind]+=1
  db.execute('INSERT OR IGNORE INTO import_sources VALUES(?,?,?)',(digest,source.name,json.dumps(sheets,ensure_ascii=False)))
 # Store a recoverable original outside source-controlled files, once only.
 archive=data_dir/'imports';archive.mkdir(exist_ok=True)
 target=archive/(digest+'.xlsx')
 if not target.exists():target.write_bytes(source.read_bytes())
 db.close();return report

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('file');parser.add_argument('--data-dir',default=str(pathlib.Path(__file__).resolve().parents[1]/'data'));args=parser.parse_args()
 print(json.dumps(import_file(args.file,args.data_dir),ensure_ascii=False))
