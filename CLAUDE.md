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
- **무엇:** 이종대왕 선생님의 "4원칙" 학급 운영 자료(아침 멘트·중간놀이·목힘·금요 인성놀이·단단마인드·수업놀이 등)를 허용 코드가 있는 사람만 보는 페이지. 주소 https://berryst41.github.io/school/class/
- **이 저장소는 공개라서 자료 글·시트 주소·코드를 절대 커밋하지 않는다.** 자료는 Supabase `bombanana`(id `bmfihlddiyfeejrdrigm`, 자료 공유 사이트와 같은 프로젝트)의 잠긴 표에만 있다.
  - 표: `cls_members`(code, name, is_admin, active, last_seen) · `cls_items`(year, month, week, kind, day, date, title, body, links jsonb, tags, src = 시트 칸 "연도|탭|칸", sort) · `cls_config`(id=1, sheets [{year, id}], cron_secret, last_sync, last_result). RLS 켜고 정책 없음 → anon은 표를 직접 못 읽음.
  - 함수(코드 확인 후 동작): cls_enter, cls_list, cls_sync_info(관리자에겐 시트 id도), cls_save·cls_delete(관리자), cls_members_list·cls_member_add(8자리 코드)·cls_member_set(켜기/끄기)·cls_member_remove(관리자). pgcrypto는 `extensions` 스키마라 search_path에 넣어야 함.
- **자료 추가 = 구글 시트에 쓰기.** Edge Function `cls-sync`(verify_jwt 끔, 원본 `class/supabase/cls-sync/index.ts`+`parse.js`)가 시트를 xlsx로 받아(앞 60줄만) 칸마다 자료 하나로 바꿔 src로 upsert, 시트에서 사라진 칸은 지움. 한 번에 한 해만(두 해를 같이 읽으면 WORKER_RESOURCE_LIMIT). 자료실을 열면 누구나 부르고(마지막 가져오기 10분 지났을 때만, 올해만), 관리자 "🔄 지금 가져오기"는 두 해 모두. pg_cron 예약은 Claude 자동 모드 권한 규칙에 막혀서 안 씀.
  - 시트 모양: 탭=달, 1줄=칸 이름, A열="N주차". 칸 → 종류는 parse.js `COLS`(특별활동=목힘, 금 놀이=금요놀이, 이름 없는 칸=기타). 아침멘트 제목은 "N주차 X요일 아침 멘트". 2026 시트의 "12월" 탭은 2025 것을 복사해 둔 것이라 같은 글은 건너뜀. "…의 사본" 탭은 건너뜀.
  - 시트는 "링크가 있는 모든 사용자" 보기 공유여야 읽힘. 시트를 새 해로 바꾸거나 더하면 `cls_config.sheets`에 {year, id}를 넣는다.
- 화면(`class/index.html`, 빌드 없음): ☀️ 오늘(요일별 종류 `TODAY_KINDS`, "이번 주" = 올해에서 가장 최근 주차 `weekKey`), 📂 모아보기(연도·종류·검색·#태그), ⚙️ 관리(가져오기·시트 열기·코드 만들기/끄기/삭제, 만들면 초대 글 복사). 시트에서 온 자료는 앱에서 못 고치고 "시트에서 고치기"로 감. 코드는 이 기기 localStorage `cls-code`.
- 관리자 코드는 사용자에게만 알려 줌(여기·커밋에 적지 않음). 잃어버리면 SQL로 `cls_members`에서 is_admin 줄을 확인.
- 남은 일: PPT·한글 파일 원본은 사용자의 다른 구글 계정 드라이브에 있음 → 시트 칸에 드라이브 링크를 넣으면 자료실에 "자료 파일" 단추로 뜸(파일 공유 설정은 따로).
