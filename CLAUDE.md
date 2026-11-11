# school 작업 규칙

- 내려받는 도구 파일(zip 등)을 올리거나 바꿀 때는 **버전을 꼭 적어요.**
  - 버전을 올리고(확장 프로그램은 `extension/manifest.json`의 `version`), 루트 README "한눈에 보기" 표의 받기 단추(예: `⬇️ 받기 v0.2.0`)를 바꿔요.
  - 도구 설명 페이지(도구 폴더의 `README.md`)의 내려받기 링크 글자, "지금 버전: **v…** (날짜)" 줄도 바꾸고, "버전 기록" 표 맨 위에 새 버전·날짜·바뀐 점을 한 줄 더해요.
  - 프로필(berryst41 저장소 README의 `TOOLS:START`~`TOOLS:END`)에도 "한눈에 보기" 표를 그대로 옮겨 넣어요.
  - 커밋 메시지에도 버전을 넣어요.
- 도구마다 설명 페이지가 따로 있어요: `pumui/`, `main-monitor/`, `share/`, `class/`, `manitto/`, `bomb-monkey/`, `docs/claude-guide/`, `docs/github-guide/` 의 `README.md`.
  - 버전이 없는 도구(안내서, 웹사이트, 게임)도 눈에 띄게 바뀌면 그 페이지의 "업데이트 기록" 표 맨 위에 날짜와 바뀐 점을 더해요.
  - 새 도구를 만들면 폴더에 설명 페이지(README.md)를 만들고, 루트 README 표와 파일 구성에 더해요.
- 설명은 초등학교 선생님이 읽기 쉬운 우리말로 써요.

## 📚 class/ — 4원칙 학급 운영 자료실 (2026-11-11 시작)
폰·웹 Claude도 이 파일만 읽으니, class를 고치면 이 칸도 같이 고쳐요.

### 폰·웹(클라우드) Claude Code에서 이어서 고칠 때
- 사용자는 학교 PC → 폰 → 집 PC를 오가며 고친다. 작업 시작 전에 `git pull origin main`부터.
- 화면은 `class/index.html` 한 파일(빌드 없음). **GitHub Pages는 `main`만 배포**하니, 작업 브랜치에서 고쳤으면 **main에 합쳐야** https://berryst41.github.io/school/class/ 에 반영된다. 사용자는 비전문가이니 끝까지 합치고 주소에서 반영됐는지 확인해 준다(1~2분 걸림).
- Supabase(표·함수·Edge Function `cls-sync`)를 고쳐야 하면 Supabase 연결(MCP)이 필요하다. 없으면 고칠 SQL/코드를 만들어 두고 "PC에서 마저 반영"이라고 아래 남은 일에 적는다. Edge Function을 고쳤으면 원본 `class/supabase/cls-sync/`도 같이 고친다.
- 로그인해서 시험하려면 관리자 코드가 필요한데 이 저장소에는 없다(아래 참고). 화면만 고친 거면 코드 없이 문법·동작을 확인하고, 사용자에게 폰에서 열어 봐 달라고 한다.
- 고칠 때마다 `class/README.md` "업데이트 기록" 맨 위에 한 줄, 그리고 이 칸도 함께 고친다.
- **무엇:** 이종대왕 선생님의 "4원칙" 학급 운영 자료(아침 멘트·중간놀이·목힘·금요 인성놀이·단단마인드·수업놀이 등)를 허용 코드가 있는 사람만 보는 페이지. 주소 https://berryst41.github.io/school/class/
- **이 저장소는 공개라서 자료 글·시트 주소·코드를 절대 커밋하지 않는다.** 자료는 Supabase `bombanana`(id `bmfihlddiyfeejrdrigm`, 자료 공유 사이트와 같은 프로젝트)의 잠긴 표에만 있다.
  - 표: `cls_members`(code, name, is_admin, active, last_seen) · `cls_items`(year, month, week, kind, day, date, title, body, links jsonb, tags, src = 시트 칸 "연도|탭|칸", sort) · `cls_config`(id=1, sheets [{year, id}], cron_secret, last_sync, last_result). RLS 켜고 정책 없음 → anon은 표를 직접 못 읽음.
  - 함수(코드 확인 후 동작): cls_enter, cls_list, cls_sync_info(관리자에겐 시트 id도), cls_save·cls_delete(관리자), cls_members_list·cls_member_add(8자리 코드)·cls_member_set(켜기/끄기)·cls_member_remove(관리자). pgcrypto는 `extensions` 스키마라 search_path에 넣어야 함.
- **자료 추가 = 구글 시트에 쓰기.** Edge Function `cls-sync`(verify_jwt 끔, 원본 `class/supabase/cls-sync/index.ts`+`parse.js`)가 시트를 xlsx로 받아(앞 60줄만) 칸마다 자료 하나로 바꿔 src로 upsert, 시트에서 사라진 칸은 지움. 한 번에 한 해만(두 해를 같이 읽으면 WORKER_RESOURCE_LIMIT). 자료실을 열면 누구나 부르고(마지막 가져오기 10분 지났을 때만, 올해만), 관리자 "🔄 지금 가져오기"는 두 해 모두. pg_cron 예약은 Claude 자동 모드 권한 규칙에 막혀서 안 씀.
  - 시트 모양: 탭=달, 1줄=칸 이름, A열="N주차". 칸 → 종류는 parse.js `COLS`(특별활동=목힘, 금 놀이=금요놀이, 이름 없는 칸=기타). 아침멘트 제목은 "N주차 X요일 아침 멘트". 2026 시트의 "12월" 탭은 2025 것을 복사해 둔 것이라 같은 글은 건너뜀. "…의 사본" 탭은 건너뜀.
  - 시트는 "링크가 있는 모든 사용자" 보기 공유여야 읽힘. 시트를 새 해로 바꾸거나 더하면 `cls_config.sheets`에 {year, id}를 넣는다.
- 화면(`class/index.html`, 빌드 없음): ☀️ 오늘("오늘의 아침멘트" = `TODAY_KINDS`, 그 아래 `WEEK_KINDS`(순서: 수업놀이·중간놀이·목힘·금요놀이 — 2026-11-11 사용자 요청으로 수업놀이를 아침멘트 바로 다음으로)를 "이번 주 ○○" 칸으로 요일 상관없이 매일 — 사용자 요청 2026-11-11 "중간놀이는 오늘의 중간놀이가 아니라 이번 주 중간놀이", 금요놀이 이름은 "금당 인성교육"(2026-11-11 "금요 인성교육"에서 바꿈), 수업놀이는 "수업놀이 추천"(`KIND_LABEL`). "이번 주" = 올해에서 가장 최근 주차 `weekKey`), 📂 모아보기(연도·종류·검색·#태그), ⚙️ 관리(가져오기·시트 열기·코드 만들기/끄기/삭제, 만들면 초대 글 복사).
- **시트 ↔ 자료실 양방향 동기화(2026-11-11, 사용자 요청)**: 시트→자료실은 기존 cls-sync(10분 주기/수동). **자료실→시트**는 Edge Function `cls-sheet-write`(verify_jwt 끔, 원본 `class/supabase/cls-sheet-write/index.ts`)가 구글 서비스 계정으로 해당 시트 칸(`src` = year|tab|addr)에 직접 씀. 관리자가 시트에서 온 자료도 ✏️ 고치기로 제목·내용·태그·링크를 고치면(종류·요일·주차·연도는 시트 칸 자리라 못 바꿈, disabled) cls_save 대신 이 함수를 부름 → 시트 칸 글을 "#태그\n\n본문\n\n추가링크"로 다시 쓰고 cls_items도 같이 업데이트. cls_save 자체는 그대로(src 있으면 거부) — 시트 item 수정은 반드시 cls-sheet-write를 거침.
  - 구글 인증: 서비스 계정 `sheet-bot@school-sheet-bot-514403.iam.gserviceaccount.com`(구글 클라우드 프로젝트 `school-sheet-bot-514403`, 사용자의 구글 계정 소유). 열쇠(JSON)는 Supabase `bombanana` 비밀값 `CLS_SHEET_SA`에 저장됨. 이 서비스 계정이 **자료실이 쓰는 구글 시트 2개 모두에 "편집자"로 공유되어 있어야** 동작함(사용자가 2026-11-11에 공유 완료). 시트를 새로 추가하면 그 시트도 이 이메일에 편집자로 공유해야 자료실→시트 저장이 됨.
  - `cls-sheet-write`는 JWT(RS256, Web Crypto)로 구글 접속 열쇠를 받아 Sheets API `values:update`(RAW)로 셀 하나를 통째로 덮어씀. 시트 칸의 원래 모양(첫 줄 태그, 그 뒤 본문)을 그대로 재구성해서 씀 — 사람이 시트에서 직접 보는 모양과 자료실 보기가 어긋나지 않게.
- **자료실에서 바로 넣기(2026-11-11, 사용자 요청 "멘트를 넣으면 태그를 보고 알아서 분류"):** ＋ 자료 추가 → 멘트를 #태그까지 붙여 넣으면 `classify()`가 ① `TAG_RULES`(위에서부터) ② 기존 자료의 태그별 종류 빈도 ③ 기타 순으로 종류를 정하고, 요일 = #X요일 태그 → `KIND_DAY` → 아침멘트면 오늘 요일, 주차 = #N주차 태그 → 이번 주, 월 = 같은 주차 자료의 월. 직접 바꾼 칸(touched)은 덮지 않음. 본문은 맨 위 태그 줄을 뺀 글, 태그·링크는 글에서 뽑음. 코드는 이 기기 localStorage `cls-code`.
  - **새로 넣는 자료를 구글 시트에도 쓰기(2026-11-11, 사용자 요청 "웹에서 넣는 자료가 시트에 입력되게", "태그가 애매한 건 그 주차에서 비어있는 분류 칸 중 왼쪽부터")**: 저장할 때 주차(`p.week`)가 있으면 `cls_save` 대신 먼저 `cls-sheet-write`를 `{place:true, year, month, week, kind}`로 부름. 그 함수가 해당 연도 시트에서 월 탭을 찾고(`'N월'` 패턴), 그 주차 줄(A열 "N주차")에서 분류 칸(`COLS`에 있는 칸, parse.js와 같은 목록을 이 함수에도 복제해 둠)을 훑어 **원하는 종류(`kind`)의 칸이 비어 있으면 그 칸, 아니면 왼쪽부터 가장 먼저 비어 있는 칸**을 찾아 거기에 씀(종류가 애매해 `기타`로 분류된 경우도 포함 — 빈 칸에 들어간 칸의 종류를 그대로 따름). 빈 칸이 전혀 없으면 `{placed:false}`를 돌려주고, 그때만 화면이 기존처럼 `cls_save`로 자료실 안에만 저장(시트 미반영, 토스트로 안내). 쓴 칸은 `src = year|tab|addr`로 `cls_items`에 upsert되어 다음 `cls-sync` 때도 같은 자료로 인식됨. 주차가 없는 자료(예: 단단마인드 등 주차 무관)는 지금은 시트에 안 쓰고 바로 `cls_save`.
- 관리자 코드는 여기·커밋에 적지 않음. **비공개 저장소 `berryst41/my-own-`의 `CLAUDE.md` "🔑 비밀 메모"에 있음** (사용자가 코드를 물으면 거기를 봄). 그것도 없으면 SQL로 `cls_members`에서 is_admin 줄을 확인.
- 남은 일: PPT·한글 파일 원본은 사용자의 다른 구글 계정 드라이브에 있음 → 시트 칸에 드라이브 링크를 넣으면 자료실에 "자료 파일" 단추로 뜸(파일 공유 설정은 따로).
