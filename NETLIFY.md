# Netlify에 무료로 올리기

마케팅 일지는 Netlify 무료 플랜에서 돌아갑니다. 화면은 `public/`, 저장은 Netlify Functions(`netlify/functions/api.mjs`)와 Netlify Blobs가 맡습니다. 별도 서버나 데이터베이스 요금이 없습니다.

1. https://app.netlify.com 에서 GitHub 계정으로 가입합니다.
2. **Add new project → Import an existing project → GitHub**를 누르고 `wjstndus0710-art/CONTENT` 저장소를 고릅니다.
3. 배포할 브랜치(`main`, 또는 아직 합치지 않았다면 `claude/great-cannon-fx0loe`)를 고릅니다. 빌드 설정은 `netlify.toml`에 들어 있으니 비워 두고 그대로 둡니다.
4. **Environment variables**에 두 값을 추가합니다.
   - `APP_USER`: 로그인 이름 (예: `admin`)
   - `APP_PASSWORD`: 본인만 아는 12자 이상 비밀번호
   비밀번호는 Netlify 화면에만 입력하고 저장소나 채팅에 적지 마세요. 설정하지 않으면 일지 API가 열리지 않습니다.
5. **Deploy**를 누릅니다. 1~2분 뒤 `https://<이름>.netlify.app` 주소가 생깁니다. 주소의 앞부분은 **Project configuration → Change project name**에서 바꿀 수 있습니다.
6. 주소에 접속하면 로그인 창이 뜹니다. 4번에서 정한 이름과 비밀번호를 입력합니다.
7. 처음에는 일지가 비어 있습니다. 상단 **백업 복원**에서 일지 백업 JSON(`journal-backup.json`)을 고르면 기존 기록이 들어옵니다. 기록이 이미 있으면 덮어쓰지 않고 거부합니다.

## 내 도메인 연결

도메인을 구입한 뒤 **Domain management → Add a domain**에서 연결합니다. Netlify가 안내하는 DNS 값을 도메인 구입처에 입력하면 HTTPS 인증서는 자동으로 붙습니다. 도메인 구입 비용은 별도입니다.

## 알아둘 점

- 로그인은 개인용 단일 계정입니다. 화면 파일 자체는 누구나 열 수 있지만, 일지 내용은 로그인해야 보입니다.
- 일지 데이터는 Netlify Blobs에 저장되고 새 배포를 해도 유지됩니다. 상단의 **백업 내려받기**로 가끔 JSON을 받아 두세요.
- 엑셀 가져오기 스크립트(`npm run import:xlsx`)는 Node 서버 버전의 SQLite에 넣습니다. Netlify에는 그 서버에서 받은 백업 JSON을 복원하는 방식으로 옮깁니다.
