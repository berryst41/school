# 🤖 cool-ai/ — 쿨메신저 비서 (2026-11-18 시작, 지금 v0.2.4)
나중에 이어서 고칠 때 이 파일부터 읽어요. 고치면 이 파일과 `cool-ai/README.md` 버전 기록을 함께 고쳐요. 공통 규칙은 school 맨 위 `CLAUDE.md`에 있어요.

### 무엇
쿨메신저로 받은 쪽지를 제미나이가 ✅ 해야 할 일 · 📝 적어야 할 것 · 💡 기억할 것으로 정리해, 항상 위에 뜨는 작은 창에 보여 주는 윈도우 프로그램. 설치할 것 없이 PowerShell만 씀(main-monitor와 같은 방식).

### 사용자가 정한 것
- AI는 **제미나이 무료**. 개인정보가 학습에 쓰일 수 있다는 위험은 설명했고, 사용자가 무료를 골랐음.
- 작업 표시줄에 안 뜸(ShowInTaskbar=False). — 단추 = Hide(), F9·바탕화면 아이콘으로 다시 Show. 그래서 ShowDialog 대신 Application.Run 사용.
- 알림 영역 아이콘(WinForms NotifyIcon, 그림으로 그린 파란 체크): 왼쪽 클릭 = Bring-Up, 오른쪽 클릭 = 메뉴. 시험할 때 강제로 끈 옛 창의 아이콘이 자리에 남아 헷갈릴 수 있음.
- 학생 이름: 필요한 할 일엔 넣음. 즐겨찾기 풀어도 항목은 그대로 둠.
- 창: 항상 위 + 투명도(◐ 막대, Ctrl+휠) + 📌 고정 끄기 + **F9**(맨 위로 ↔ 다른 창 뒤로 보내기, 설정에서 바꿀 수 있음).
- 새 쪽지는 자동 정리. 처음엔 **최근 7일 쪽지 + 즐겨찾기(★) 쪽지는 기간 상관없이**. 기한 지난 건 빼고 숨김.

### 파일 (`cool-ai/program/`, 설치하면 `%LOCALAPPDATA%\CoolAI\program\`로 복사)
- `common.ps1` 경로·`설정.txt` 읽기·JSON 저장 / `engine.ps1` 숨김 엔진(쪽지 읽기 + 제미나이) / `window.ps1` WPF 창(엔진을 자식으로 켜고, 죽으면 30초 안에 다시 켬)
- `install.ps1`·`uninstall.ps1` + `1_설치하기.bat`·`2_제거하기.bat`, `사용방법.txt`. 고친 뒤 `cool-ai.zip`을 다시 만들어요(`Compress-Archive -Path 'program\*'`).
- 데이터(`%LOCALAPPDATA%\CoolAI\`): 설정.txt(API 키), items.json, msgs.json, state.json(lastKey·since·favDone), done.json, ui.json, status.json, log.txt. **절대 커밋하지 않기.**

### AI 비서와 맞추기 (v0.2.4~)
- toy-store `AI-비서/pc-일꾼/worker.js`(PC 일꾼)가 items.json·done.json을 20초마다 읽어 정리된 항목만 Supabase `ai_cool`에 올리고, 앱에서 체크한 것은 done.json에 써요(msgs.json·설정.txt는 안 읽음).
- 그래서 window.ps1은 done.json을 **바뀔 때마다 다시 읽고**(2초 타이머, `Load-Done`), 체크할 때도 먼저 다시 읽은 뒤 써요. done.json 모양(항목 id 문자열 배열)을 바꾸면 PC 일꾼도 같이 고쳐야 해요.

### 쿨메신저 쪽지 파일
- `%LOCALAPPDATA%\CoolMessenger\Memo\<계정>.udb` = 암호 없는 SQLite(WAL 사용). 복사본(udb+wal)을 `C:\Windows\System32\winsqlite3.dll`로 읽음.
- `tbl_recv`: MessageKey, ReceiveDate(`2026/11/18 09:00:00 (수)`), Sender, Title, MessageText(평문), FilePath(`|개수|크기|폴더|파일명|…`), **IsChecked=1 → 즐겨찾기로 보고 있음(추정, 사용자 확인 아직)**.

### 함정 (겪은 것)
- 무료 `gemini-flash-latest`(=3.8 Flash)는 **하루 20번**뿐이고 느림(생각하기 켜면 1+1에도 3분) → 기본은 `gemini-flash-lite-latest`(6초). Flash엔 `thinkingBudget=0`, Lite에 넣으면 400 → 400이면 빼고 다시 보냄.
- 한국어 윈도우에서 `ToString('yyyy/MM/dd')`의 `/`가 `-`로 바뀜 → `'yyyy\/MM\/dd'` + InvariantCulture.
- `-Filter '*.udb'`가 `.udb-wal`도 잡음 → `Extension -eq '.udb'`. PS 5.1 `[IO.File]::Replace(a,b,$null)` 실패 → `[NullString]::Value`.
- ps1은 **UTF-8 BOM** 필수(Write 도구로 만들면 BOM을 붙여야 함). .bat 안엔 한글 쓰지 않기.
- 엔진만 고칠 땐: 고친 파일을 설치 폴더에 먼저 복사한 뒤 엔진 프로세스를 끄면 창이 새 코드로 다시 켬.
- 처음부터 다시 정리하려면 state.json·items.json·msgs.json을 지우면 돼요(무료 사용량을 쓰니 조심).

### 남은 일 (2026-11-18 기준)
- [ ] IsChecked가 정말 즐겨찾기인지 사용자 확인
- [x] `내_정보` 넣음 (사용자가 직접, 2026-11-18)
- [ ] Flash-Lite 무료 하루 한도 확인. 모자라면 새 쪽지를 몇 분씩 모아서 보내기
- 사용자 결정: 할 일에 **필요하면 학생 이름을 넣는다**(전화번호·주민번호·건강 정보는 뺌). **즐겨찾기를 풀어도 항목은 숨기지 않는다.**
- [ ] 옛 즐겨찾기의 기한 없는 할 일이 할 일 칸에 쌓이던 것 → 프롬프트로 고침, 이미 만든 항목은 그대로 둠
