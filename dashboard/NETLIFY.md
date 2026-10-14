# Netlify에 무료로 올리기

콘텐츠 대시보드는 Netlify 무료 플랜에서 돌아갑니다. 화면은 `public/`, 저장은 Netlify Functions(`netlify/functions/api.mjs`)와 Netlify Blobs가 맡습니다. 별도 서버나 데이터베이스 요금이 없습니다.

마케팅 일지와는 **별도 사이트**로 만듭니다(같은 저장소, 다른 폴더).

1. https://app.netlify.com 에 로그인합니다(일지를 올린 계정 그대로).
2. **Add new project → Import an existing project → GitHub**에서 `wjstndus0710-art/CONTENT` 저장소를 고릅니다.
3. 설정 화면에서
   - **Branch to deploy**: `claude/content-dashboard-blwu5q` (main에 합친 뒤에는 `main`)
   - **Base directory**: `dashboard`
   - 나머지(빌드 명령, Publish directory, Functions directory)는 `dashboard/netlify.toml`에 들어 있으니 비워 둡니다.
4. **Environment variables**에 두 값을 추가합니다.
   - `APP_USER`: 로그인 아이디 (예: `admin`)
   - `APP_PASSWORD`: 본인만 아는 12자 이상 비밀번호
   비밀번호는 Netlify 화면에만 입력하고 저장소나 채팅에 적지 마세요. 설정하지 않으면 로그인 화면에 안내가 나오고 데이터가 열리지 않습니다.
5. **Deploy**를 누릅니다. 1~2분 뒤 `https://<이름>.netlify.app` 주소가 생깁니다. 앞부분은 **Project configuration → Change project name**에서 바꿀 수 있습니다(예: `content-dashboard`).
6. 주소에 접속하면 대시보드가 **보기 전용**으로 열립니다. 오른쪽 위 **로그인**을 누르고 4번의 아이디·비밀번호를 넣으면 추가·수정·삭제·가져오기·백업을 할 수 있습니다. ‘이 기기에서 로그인 유지’를 켜면 다음부터 바로 수정 모드로 열리고, 왼쪽 메뉴 **로그아웃**을 누르면 다시 보기 전용이 됩니다.

## 처음 데이터

처음 접속하면 2026년 10월 14일 기준 claude.ai 대시보드의 데이터(콘텐츠 21건, 블로그 월 통계 82건)가 서버 저장소에 들어갑니다.

그 뒤에 claude.ai 링크에서 고친 내용까지 옮기려면 claude.ai 쪽에서 **백업 저장(JSON)** → Netlify 쪽에서 **백업 불러오기**를 하면 됩니다(현재 데이터를 백업 내용으로 바꿉니다).

## 알아둘 점

- 대시보드는 **주소를 아는 누구나 로그인 없이 볼 수 있습니다**(CSV 내보내기 포함). 추가·수정·삭제, 엑셀/블로그 통계 가져오기, JSON 백업 저장·불러오기, 전체 삭제는 로그인한 사람만 할 수 있습니다. 계정은 하나입니다.
- 데이터는 Netlify Blobs(`content-dashboard` 저장소)에 저장되고 새로 배포해도 유지됩니다. 가끔 **백업 저장(JSON)**을 받아 두세요.
- 엑셀 가져오기(시트·블로그 통계)는 SheetJS를 cdnjs에서 불러오므로 인터넷이 필요합니다.
- 다른 기기에서 열린 화면은 실시간으로 바뀌지 않고, 그 탭으로 돌아오면 서버 내용을 다시 읽습니다.
- 내 도메인 연결은 **Domain management → Add a domain**에서 합니다. HTTPS 인증서는 자동으로 붙습니다.
