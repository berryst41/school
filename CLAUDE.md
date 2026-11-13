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
  - `cls_list`는 2026-11-13부터 표(SETOF) 대신 **JSON 배열 하나**로 돌려줌(한 번에 가져오는 줄 수 제한 회피, SQL은 `class/supabase/cls_list.sql`). 화면은 `rpc('cls_list') || []`라 그대로 동작.
  - **"불러오는 중…"에서 멈추던 버그 고침(2026-11-13)**: 커밋 0ba9c29부터 `index.html`이 `KIND_TABS`·`TAB_KINDS`를 쓰는데 정의가 빠져 있어 `render()`가 ReferenceError로 죽었음(서버는 정상이었음). `WEEK_KINDS` 아래에 `KIND_TABS`(=WEEK_KINDS+단단마인드·교사마인드·주간교육·기타)·`TAB_KINDS = k => [k]`를 다시 정의함 — 원래 정의를 못 찾아 사용 코드에서 추정해 만든 것이라, 탭 구성을 바꾸고 싶으면 여기를 고침. 확인은 Playwright로 `file://` 열어 localStorage `cls-code` 넣고 pageerror 보기.
  - 함수(코드 확인 후 동작): cls_enter, cls_list, cls_sync_info(관리자에겐 시트 id도), cls_save·cls_delete(관리자), cls_members_list·cls_member_add(8자리 코드)·cls_member_set(켜기/끄기)·cls_member_remove(관리자). pgcrypto는 `extensions` 스키마라 search_path에 넣어야 함.
- **자료 추가 = 구글 시트에 쓰기.** Edge Function `cls-sync`(verify_jwt 끔, 원본 `class/supabase/cls-sync/index.ts`+`parse.js`)가 시트를 xlsx로 받아(앞 60줄만) 칸마다 자료 하나로 바꿔 src로 upsert, 시트에서 사라진 칸은 지움. 한 번에 한 해만(두 해를 같이 읽으면 WORKER_RESOURCE_LIMIT). 자료실을 열면 누구나 부르고(마지막 가져오기 10분 지났을 때만, 올해만), 관리자 "🔄 지금 가져오기"는 두 해 모두, `force:true`로 10분 제한을 건너뜀.
  - **관리자가 열 때마다 느려지던 버그 고침(2026-11-12, 사용자 "어플 켜지는데 너무 오래 걸려")**: 전엔 `cls-sync`가 관리자 코드로 부르면 10분 제한 없이 **열 때마다 매번** 구글 시트 전체를 다시 받아와 파싱했음(일반 사용자는 10분 제한 적용돼 있었는데 관리자만 빠져 있던 버그). 이제 관리자도 `force` 없이 그냥 열 때는 똑같이 10분 제한을 받고, ⚙️ 관리의 "🔄 지금 가져오기" 단추를 누를 때만(`sync(true, true)` → `{force:true}`) 바로 다시 받아옴. `index.html`의 `sync(all, force)`가 `force`를 서버로 넘김, `start()`의 자동 호출은 `sync(false)`(force 없음).
  - 시트 모양: 탭=달, 1줄=칸 이름, A열="N주차". 칸 → 종류는 parse.js `COLS`(특별활동=목힘, 금 놀이=금요놀이, 이름 없는 칸=기타). 아침멘트 제목은 "N주차 X요일 아침 멘트". 2026 시트의 "12월" 탭은 2025 것을 복사해 둔 것이라 같은 글은 건너뜀. "…의 사본" 탭은 건너뜀.
  - **한 칸에 자료 여러 개 쪼개기(2026-11-11, 사용자 요청 "목힘 중에 숫자 따로 달려있는 건 칸을 분리", "구글 시트에서는 한 칸에 다 들어가도 괜찮아", "(1)(2)처럼 번호 매긴 것도 쪼개고 제목도 주제별로", "중간 놀이는 나누면 안돼. 하나의 주제에 대해 여러 멘트인거야")**: `parse.js`의 `splitChunks(text, kind)`가 한 칸 글 안에서 ① 해시태그만 있는 줄(예: `#목힘2`, 모든 종류) ② **목힘 칸에서만** `(1)` `(2)`처럼 괄호 번호로 시작하는 줄을, 맨 처음 것은 빼고 경계로 봐서 여러 자료로 쪼갬. **중간놀이 등 목힘이 아닌 칸은 괄호 번호로 안 나눔**(번호가 한 주제 안의 여러 멘트·단계일 뿐이라 나누면 글이 끊어짐 — 해시태그 줄로는 똑같이 나뉨). 시트 칸은 그대로 두고 `cls_items`만 여러 줄로 나뉨(각 조각의 종류·요일·주차는 모두 그 칸의 원래 종류를 그대로 씀). `(1) 소방의 날 계기교육`처럼 괄호 번호로 시작하면 제목에서 그 번호를 떼고 보여줌(`makeItem`의 title 추출에서 `/^\(\d+\)\s*/` 제거, 종류 상관없이). 태그 줄 바로 뒤에 번호 줄이 오면 태그만 있는 조각이 혼자 "(제목 없음)" 빈 자료가 되던 버그(2026-11-11 사용자 발견 "목힘 좀 이상하게 나뉘었는데")를 고쳐서, 실제 내용이 없는 조각(태그·빈 줄만)은 다음 조각 앞에 붙임(`splitChunks`의 `merged`/`pending` 단계, `isEmptyLine` 판정). 둘째 조각부터 `src`에 `#2`,`#3`…을 붙임(`year|tab|addr#2`). **이렇게 쪼개진 자료는 자료실 "✏️ 고치기"로 못 고침**(한 쪽만 고쳐 쓰면 같은 칸의 다른 조각이 지워짐) — `openItem()`이 `S.items`에서 같은 기본 src를 가진 다른 자료가 있는지 보고 버튼을 숨기고, `cls-sheet-write`도 서버에서 한 번 더 막음(`src`에 `#` 있거나 짝이 있으면 400). "📝 시트에서 고치기"만 가능.
  - 시트는 "링크가 있는 모든 사용자" 보기 공유여야 읽힘. 시트를 새 해로 바꾸거나 더하면 `cls_config.sheets`에 {year, id}를 넣는다.
- 화면(`class/index.html`, 빌드 없음): ☀️ 오늘("오늘의 아침멘트" = `TODAY_KINDS`, 그 아래 `WEEK_KINDS`(순서: 수업놀이·중간놀이·목힘·금요놀이 — 2026-11-11 사용자 요청으로 수업놀이를 아침멘트 바로 다음으로)를 "이번 주 ○○" 칸으로 요일 상관없이 매일 — 사용자 요청 2026-11-11 "중간놀이는 오늘의 중간놀이가 아니라 이번 주 중간놀이", 금요놀이 이름은 "금당 인성교육"(2026-11-11 "금요 인성교육"에서 바꿈), 수업놀이는 "수업놀이 추천"(`KIND_LABEL`). "이번 주" = 올해에서 가장 최근 주차 `weekKey`), 📂 모아보기(연도·종류·검색·#태그), ⚙️ 관리(가져오기·시트 열기·코드 만들기/끄기/삭제, 만들면 초대 글 복사).
- **시트 ↔ 자료실 양방향 동기화(2026-11-11, 사용자 요청)**: 시트→자료실은 기존 cls-sync(10분 주기/수동). **자료실→시트**는 Edge Function `cls-sheet-write`(verify_jwt 끔, 원본 `class/supabase/cls-sheet-write/index.ts`)가 구글 서비스 계정으로 해당 시트 칸(`src` = year|tab|addr)에 직접 씀. 관리자가 시트에서 온 자료도 ✏️ 고치기로 제목·내용·태그·링크를 고치면(종류·요일·주차·연도는 시트 칸 자리라 못 바꿈, disabled) cls_save 대신 이 함수를 부름 → 시트 칸 글을 "#태그\n\n본문\n\n추가링크"로 다시 쓰고 cls_items도 같이 업데이트. cls_save 자체는 그대로(src 있으면 거부) — 시트 item 수정은 반드시 cls-sheet-write를 거침.
  - 구글 인증: 서비스 계정 `sheet-bot@school-sheet-bot-514403.iam.gserviceaccount.com`(구글 클라우드 프로젝트 `school-sheet-bot-514403`, 사용자의 구글 계정 소유). 열쇠(JSON)는 Supabase `bombanana` 비밀값 `CLS_SHEET_SA`에 저장됨. 이 서비스 계정이 **자료실이 쓰는 구글 시트 2개 모두에 "편집자"로 공유되어 있어야** 동작함(사용자가 2026-11-11에 공유 완료). 시트를 새로 추가하면 그 시트도 이 이메일에 편집자로 공유해야 자료실→시트 저장이 됨.
  - `cls-sheet-write`는 JWT(RS256, Web Crypto)로 구글 접속 열쇠를 받아 Sheets API `values:update`(RAW)로 셀 하나를 통째로 덮어씀. 시트 칸의 원래 모양(첫 줄 태그, 그 뒤 본문)을 그대로 재구성해서 씀 — 사람이 시트에서 직접 보는 모양과 자료실 보기가 어긋나지 않게.
- **자료실에서 바로 넣기(2026-11-11, 사용자 요청 "멘트를 넣으면 태그를 보고 알아서 분류"):** ＋ 자료 추가 → 멘트를 #태그까지 붙여 넣으면 `classify()`가 ① `TAG_RULES`(위에서부터) ② 기존 자료의 태그별 종류 빈도 ③ 기타 순으로 종류를 정하고, 요일 = #X요일 태그 → `KIND_DAY` → 아침멘트면 오늘 요일, 주차 = #N주차 태그 → 이번 주, 월 = 같은 주차 자료의 월. 직접 바꾼 칸(touched)은 덮지 않음. 본문은 맨 위 태그 줄을 뺀 글, 태그·링크는 글에서 뽑음. 코드는 이 기기 localStorage `cls-code`.
  - **새로 넣는 자료를 구글 시트에도 쓰기(2026-11-11, 사용자 요청 "웹에서 넣는 자료가 시트에 입력되게", "태그가 애매한 건 그 주차에서 비어있는 분류 칸 중 왼쪽부터")**: 저장할 때 주차(`p.week`)가 있으면 `cls_save` 대신 먼저 `cls-sheet-write`를 `{place:true, year, month, week, kind}`로 부름. 그 함수가 해당 연도 시트에서 월 탭을 찾고(`'N월'` 패턴), 그 주차 줄(A열 "N주차")에서 분류 칸(`COLS`에 있는 칸, parse.js와 같은 목록을 이 함수에도 복제해 둠)을 훑어 **원하는 종류(`kind`)의 칸이 비어 있으면 그 칸, 아니면 왼쪽부터 가장 먼저 비어 있는 칸**을 찾아 거기에 씀(종류가 애매해 `기타`로 분류된 경우도 포함 — 빈 칸에 들어간 칸의 종류를 그대로 따름). 빈 칸이 전혀 없으면 `{placed:false}`를 돌려주고, 그때만 화면이 기존처럼 `cls_save`로 자료실 안에만 저장(시트 미반영, 토스트로 안내). 쓴 칸은 `src = year|tab|addr`로 `cls_items`에 upsert되어 다음 `cls-sync` 때도 같은 자료로 인식됨. 주차가 없는 자료(예: 단단마인드 등 주차 무관)는 지금은 시트에 안 쓰고 바로 `cls_save`.
- 관리자 코드는 여기·커밋에 적지 않음. **비공개 저장소 `berryst41/my-own-`의 `CLAUDE.md` "🔑 비밀 메모"에 있음** (사용자가 코드를 물으면 거기를 봄). 그것도 없으면 SQL로 `cls_members`에서 is_admin 줄을 확인.
- **오픈톡방 카톡 → 자료실 자동 등록 (2026-11-12 시작, 진행 중 — 클라우드 Claude가 1·2번 이어서 함)**
  - **사용자 요청:** "오픈 톡방에 올라오는 카톡을 체크해서 멘트에 해당되는 태그를 보면 그 메세지를 자동으로 여기에 넣어줘. 잘못 올라간 게 있는지 업데이트 내역을 내가 체크할 수 있게." → 사용자 폰은 **안드로이드**, **`#이종대왕`이 붙은 메시지만** 읽으면 됨(다른 대화는 서버에 남기지 않기로).
  - **방식:** 카톡에는 공식 읽기 API가 없어서, 폰의 알림 앱(MacroDroid 등)이 카톡 알림을 받을 때 서버 함수로 POST. 알림 글이 길면 **잘릴 수 있음**이 약점 → 끝이 `…`이면 내역에 "잘렸을 수 있어요" 메모를 남김. 안 되면 대안: 톡방 "대화 내보내기" txt를 올려 태그 있는 것만 가져오기(아직 안 만듦).
  - **✅ 이미 한 것(Supabase bombanana에 적용·배포 완료):**
    - 표 `cls_inbox`(received_at, sender, room, raw, item_id→cls_items, kind, status new/ok/removed, note, dedupe 중복방지) + `cls_config.inbox_token` 열. RLS 켜고 정책 없음. SQL 기록은 `class/supabase/cls_inbox.sql`.
    - 함수 `cls_inbox_list(p_code)`(관리자, 최근 200개), `cls_inbox_set(p_code, p_id, p_action)`('ok' 맞아요 / 'remove' 자료실에서 삭제 / 'ok_all' 새 것 전부 맞아요).
    - Edge Function `cls-inbox`(v1, verify_jwt 끔, 원본 `class/supabase/cls-inbox/index.ts`): `POST {token, title, text}`(또는 `sender`·`text`). token이 `cls_config.inbox_token`과 같아야 함(헤더 `x-inbox-token`·본문·`?token=` 모두 가능). `#이종대왕` 없으면 버림. 알림 글 "보낸이 : 메시지" 모양이면 보낸이를 떼어 냄. 같은 글은 한 번만(해시). 종류는 index.html `classify()`와 같은 `TAG_RULES`(이 함수에도 복제해 둠 — **한쪽을 고치면 다른 쪽도**), 태그로 못 정하면 기존 자료의 비슷한 태그 → 그래도 없으면 기타(+내역 메모). 요일·주차·월도 같은 규칙(#N주차 태그 → 없으면 이번 주). cls_items에 `src` 없이 넣음(그래서 cls-sync가 지우지 않음, **구글 시트에는 안 써짐** — 필요하면 `cls-sheet-write`의 `place:true`로 이어 붙이는 방법 검토).
    - 주소: `https://bmfihlddiyfeejrdrigm.supabase.co/functions/v1/cls-inbox`. **토큰 값은 공개 저장소라 여기 적지 않음** → Supabase SQL `select inbox_token from cls_config where id=1`로 꺼냄(MCP `execute_sql`, project `bmfihlddiyfeejrdrigm`).
  - **❌ 남은 일(순서대로):**
    1. ✅ **끝까지 시험함(2026-11-12, 클라우드 Claude)**: 이 세션 환경 네트워크에 `bmfihlddiyfeejrdrigm.supabase.co`를 임시로 허용해(`update_environment`) curl로 직접 호출. `#이종대왕 #목힘 …` → `cls_items`·`cls_inbox`에 정상 등록(kind/week/day 맞음, sender "A : 글" 모양에서 A를 잘 떼어 냄). 태그 없는 글 → `{ignored:"no tag"}`로 버려짐. 같은 글 재전송 → `{ignored:"duplicate"}`로 무시됨. 틀린 토큰 → `{error:"denied"}`. **시험 데이터는 SQL로 지움**(해당 cls_items·cls_inbox 행 delete, 남은 개수 0 확인).
    2. ✅ **화면(`index.html`) 「📥 자동 등록」 관리자 탭 만듦(2026-11-12, 클라우드 Claude)**: `S.inbox`에 `cls_inbox_list` 결과를 담고(`load()`에서 관리자일 때만 같이 불러옴), `render()`의 `tabs`에 `⚙️ 관리` 바로 앞에 추가(새 것 개수를 탭 이름에 `(N)`으로 표시). `viewInbox()`가 카드마다 시각·보낸이·방 이름·원문·들어간 곳(종류·요일·주차)·메모를 보여 주고, `new` 상태는 테두리를 초록으로. 단추 `✅ 맞아요`(new일 때만)·`✏️ 종류·내용 고치기`(`S.items`에서 `item_id`로 찾아 기존 `editItem` 재사용)·`🗑️ 삭제`, 위쪽에 `new`가 있으면 `✅ 새 것 전부 맞아요`. 모든 동작 후 `load()`로 전체 다시 불러와 탭 배지까지 갱신. `#view`는 관리 탭처럼 `cards` 그리드를 뺌.
    3. ✅ **안드로이드 설정 안내함(2026-11-12, 클라우드 Claude, 대화로 토큰 전달)**: MacroDroid(무료판 매크로 5개 제한 OK)로 트리거 "알림 수신 → 카카오톡 → 텍스트에 `#이종대왕` 포함", 동작 "HTTP 요청 POST, 위 주소, 본문 JSON `{"token":"…","title":"[notification_title]","text":"[notification_text]"}`". 폰 배터리 최적화에서 MacroDroid 제외, 그 톡방 알림 켜 둘 것 안내함. **이어서 사용자가 "오픈톡방 글이 많고 멘트가 길다"고 걱정해서, 알림은 긴 글이 잘릴 수 있다는 한계를 설명하고(기기·앱 버전마다 달라 정확한 글자 수는 말 못 함, 대략 200~500자부터 위험) 4번 대신 아래 "✅ 대화 글 붙여넣기"를 먼저 만듦(더 확실한 방법).**
    4. ✅ **대화 글 붙여넣기 가져오기 만듦(2026-11-12, 클라우드 Claude, 알림이 잘리거나 한꺼번에 묶여 빠지는 문제의 대안)**: `cls-inbox` Edge Function에 길 `② 관리자가 대화 글 붙여넣을 때` 추가 — 기존 메시지 처리 로직을 `processOne(db, sender, room, text, fromPaste)`로 빼서 재사용. `POST {code, messages:[{sender,room,text}]}`(관리자 코드로 `cls_is_admin` 확인, 알림용 `token`과는 다른 인증) → 메시지마다 `processOne`을 돌려 `{total, added, duplicate, skipped}`로 응답. `fromPaste=true`면 "잘렸을 수 있어요" 메모를 안 남김(붙여넣기는 원문 그대로라 잘릴 걱정 없음) 대신 "대화 글 붙여넣기로 들어옴" 메모.
       - 화면: 「📥 자동 등록」 탭 위쪽에 **✍️ 대화 글 붙여넣기** 단추 → `pasteImport()` 모달. 큰 textarea에 카톡 대화를 그대로 붙여넣으면 `parseChat(text)`가 메시지 여러 개로 나눔: "이름, 날짜 오전/오후 시간"이나 "[이름] [오전 시간]" 같은 머리줄이 하나라도 있으면 그 모양으로만 끊고(본문 속 "영상: https://..." 같은 "라벨: 내용" 줄은 안 건드림 — 처음엔 이것 때문에 본문이 잘려나가는 버그가 있었고 고침), 머리줄이 전혀 없으면(예: 알림 캡처 모음처럼 "이름 : 내용" 한 줄짜리들) 그 모양으로 한 줄씩. `#이종대왕` 있는 메시지만 추려서 **먼저 미리보기**(몇 개 찾았는지·내용)를 보여주고, 확인 후 눌러야 서버로 보냄(카톡 버전마다 모양이 달라 정확하지 않을 수 있어서 바로 보내지 않음). 서버 결과(`added`/`duplicate`)를 토스트로 보여줌.
       - **카톡 내보내기(txt 파일) 가져오기는 아직 안 만듦** — 지금은 "복사해서 붙여넣기"만 되고, 파일 업로드는 필요해지면 다음에 추가.
    - **📱 폰(안드로이드) 연결 차근차근 안내 (2026-11-13, 사용자 요청 "뭘 설치하는지부터 맨 처음부터" — 사용자가 폰에서 이 파일을 꺼내 보며 따라 함)**
      - **현재 상태:** 2026-11-13 기준 `cls_inbox`에 **들어온 글이 0개** = 폰에서 실제로 연결된 적 없음. 사용자는 "폰 연결부터 확인"을 골랐고, 폰 설정 후 시험 글을 보내면 Claude가 `select * from cls_inbox order by received_at desc`로 들어왔는지 확인 → 시험 글은 SQL로 지움(해당 cls_items·cls_inbox 행 delete).
      - **토큰은 여기 적지 않음(공개 저장소).** 사용자가 달라고 하면 SQL `select inbox_token from cls_config where id=1`(MCP `execute_sql`, project `bmfihlddiyfeejrdrigm`)로 꺼내 **대화로만** 알려 줌. 폰에 긴 토큰을 손으로 치기 어려우니 카톡 "나와의 채팅"에 주소·본문을 보내 두고 복사·붙여넣기 하게 안내함.
      - **0. 준비:** 주소 `https://bmfihlddiyfeejrdrigm.supabase.co/functions/v1/cls-inbox`, 본문 `{"token":"<토큰>","title":"[notification_title]","text":"[notification_text]"}` 두 줄을 나와의 채팅에 보내 둠.
      - **1. 설치:** Play 스토어에서 **MacroDroid**(파란 아이콘, 무료판으로 충분) 검색·설치.
      - **2. 알림 읽기 허용:** MacroDroid가 알림 권한을 물으면 허용 → 폰 설정 화면에서 MacroDroid 스위치 켜기(경고창도 허용). 이게 없으면 카톡 알림을 못 봄.
      - **3. 매크로 만들기**(매크로 추가 +): ① 트리거 `+` → 알림 → 알림 수신 → 응용 프로그램 **카카오톡** → 텍스트 **포함** `#이종대왕`. ② 동작 `+` → 연결/웹 → **HTTP 요청** → URL에 위 주소, 방식 **POST**, 내용 종류 **application/json**, 본문에 위 본문. ③ 이름 `자료실 전달` 등으로 저장, 매크로 스위치 켜 둠.
      - **4. 배터리(빼먹으면 꺼짐):** 폰 설정 → 앱 → MacroDroid → 배터리 → **제한 없음**(최적화 안 함). 카톡에서 그 톡방 **알림이 켜져 있는지** 확인.
      - **5. 시험:** 톡방(또는 나와의 채팅)에 `#이종대왕 #목힘 연결 시험` 전송 → 사용자가 "보냈어"라고 하면 Claude가 위 SQL로 확인. **내가 보낸 글은 알림이 안 올 수 있으니** 가능하면 다른 사람 글 알림으로 시험. 안 들어오면 MacroDroid의 HTTP 응답 코드·오류 글을 물어 원인을 좁힘(401/denied=토큰 틀림, 알림 자체가 안 뜸=2·4번 권한).
      - 화면 이름은 MacroDroid 버전마다 조금 다를 수 있음. 사용자가 막힌 단계의 화면 글을 알려 주면 거기서부터 이어서 도움. 사용자는 비전문가 — 쉬운 말로, 한 단계씩.
    5. (선택) 자동 등록된 자료를 시트에도 쓰기(`cls-sheet-write`의 `place:true` 재사용 검토).
  - 사용자 확인 사항: 단체방 다른 선생님 글이 서버에 남는 것이므로 `#이종대왕` 없는 글은 저장 안 함(이미 구현). 방 규칙상 문제 없는지는 사용자가 판단.
- 남은 일: PPT·한글 파일 원본은 사용자의 다른 구글 계정 드라이브에 있음 → 시트 칸에 드라이브 링크를 넣으면 자료실에 "자료 파일" 단추로 뜸(파일 공유 설정은 따로).
