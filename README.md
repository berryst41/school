<div align="center">

# 🍓 딸기농장

**교실에서 바로 쓰는 웹 도구들이에요.**
설치 없이 링크만 열면 태블릿, 노트북, 휴대폰 어디서나 돼요.


![대상](https://img.shields.io/badge/대상-초등학생-ffb703?style=for-the-badge)
![설치](https://img.shields.io/badge/설치-필요_없음-2f9e44?style=for-the-badge)
![기기](https://img.shields.io/badge/기기-태블릿·노트북·휴대폰-4c6ef5?style=for-the-badge)

</div>

<br>

## ✨ 한눈에 보기

<table>
<tr><th align="left">도구 <sub>(누르면 설명 페이지로)</sub></th><th align="left">이럴 때 써요</th><th width="80">열기</th></tr>
<tr><td colspan="3"><b>💼 업무에 쓰는 도구</b></td></tr>
<tr>
<td>📘 <a href="https://github.com/berryst41/school/tree/main/docs/claude-guide"><b>처음 써 보는 Claude</b></a></td>
<td>AI가 처음인 선생님을 위한 Claude 안내서 (웹페이지·PDF)</td>
<td align="center"><a href="https://berryst41.github.io/school/docs/claude-guide.html"><b>📖&nbsp;보&#8288;기</b></a></td>
</tr>
<tr>
<td>🐙 <a href="https://github.com/berryst41/school/tree/main/docs/github-guide"><b>깃허브 첫걸음</b></a></td>
<td>깃허브가 처음인 선생님을 위한 안내서 (웹페이지)</td>
<td align="center"><a href="https://berryst41.github.io/school/docs/github-guide.html"><b>📖&nbsp;보&#8288;기</b></a></td>
</tr>
<tr>
<td>🧾 <a href="https://github.com/berryst41/school/tree/main/pumui"><b>품의 기안 도우미</b></a></td>
<td>쇼핑몰 장바구니로 품의 기안을 쓰고 에듀파인에 바로 채워요 (크롬 확장 프로그램)</td>
<td align="center"><a href="https://github.com/berryst41/school/raw/main/pumui/pumui-extension.zip"><b>⬇️&nbsp;받&#8288;기<br>v0.2.0</b></a></td>
</tr>
<tr>
<td>🖥️ <a href="https://github.com/berryst41/school/tree/main/main-monitor"><b>메인 모니터로 열기</b></a></td>
<td>듀얼 모니터에서 한글·엑셀·브라우저가 골라 둔 모니터(메인/서브)에 열려요 (윈도우 프로그램)</td>
<td align="center"><a href="https://github.com/berryst41/school/raw/main/main-monitor/main-monitor.zip"><b>⬇️&nbsp;받&#8288;기<br>v1.4.1</b></a></td>
</tr>
<tr><td colspan="3"><b>🧑‍🏫 수업에 쓰는 도구</b></td></tr>
<tr>
<td>📚 <a href="https://github.com/berryst41/school/tree/main/class"><b>4원칙 학급 운영 자료실</b></a></td>
<td>아침 멘트·중간놀이·목힘·금요 인성놀이를 요일에 맞춰 폰·PC로 봐요 (허용 코드가 있는 사람만)</td>
<td align="center"><a href="https://berryst41.github.io/school/class/"><b>📚&nbsp;열&#8288;기</b></a></td>
</tr>
<tr>
<td>📮 <a href="https://github.com/berryst41/school/tree/main/share"><b>자료 공유 사이트</b></a></td>
<td>사진·영상·파일을 QR코드로 학생들과 나눠요</td>
<td align="center"><a href="https://berryst41.github.io/school/share/"><b>📂&nbsp;열&#8288;기</b></a></td>
</tr>
<tr>
<td>🐵💣 <a href="https://github.com/berryst41/school/tree/main/bomb-monkey"><b>폭탄원숭이</b></a></td>
<td>3명이 협동해서 폭탄을 해체하는 장애이해교육 게임</td>
<td align="center"><a href="https://berryst41.github.io/school/"><b>🎮&nbsp;하&#8288;기</b></a></td>
</tr>
<tr>
<td>🎁 <a href="https://github.com/berryst41/school/tree/main/manitto"><b>마니또 뽑기</b></a></td>
<td>아이들이 한 명씩 나와 버튼을 눌러 마니또를 뽑아요 (자기 자신·중복·서로 마니또 없음)</td>
<td align="center"><a href="https://berryst41.github.io/school/manitto/"><b>🎁&nbsp;열&#8288;기</b></a></td>
</tr>
</table>

> [!TIP]
> **도구 이름**을 누르면 설치 방법, 쓰는 법, 버전 기록이 담긴 설명 페이지가 열려요.
> 오른쪽 **열기** 칸을 누르면 도구를 바로 쓰거나 내려받아요.

<br>

## 🗂️ 파일 구성

도구마다 폴더가 있고, 폴더 안 **README.md** 가 그 도구의 설명 페이지예요.

```
school/
├── index.html        🐵 폭탄원숭이 게임
├── bomb-monkey/
│   └── README.md        폭탄원숭이 설명
├── manitto/
│   ├── index.html    🎁 마니또 뽑기
│   └── README.md        설명
├── share/
│   ├── index.html    📮 자료 공유 사이트
│   ├── qrcode.js        QR코드 만들기
│   └── README.md        설명
├── class/
│   ├── index.html    📚 4원칙 학급 운영 자료실
│   ├── supabase/        구글 시트 가져오기 (서버 함수 원본)
│   └── README.md        설명
├── supabase.js          온라인 저장소 연결
├── pumui/
│   ├── extension/       🧾 품의 기안 도우미 (크롬 확장 프로그램)
│   ├── pumui-extension.zip  내려받기용 압축 파일
│   └── README.md        설명
├── main-monitor/
│   ├── program/         🖥️ 메인 모니터로 열기 (윈도우 프로그램)
│   ├── main-monitor.zip     내려받기용 압축 파일
│   └── README.md        설명
├── docs/
│   ├── claude-guide.html 📘 처음 써 보는 Claude (웹 안내서)
│   ├── claude-guide.pdf  📘 처음 써 보는 Claude (PDF 원본)
│   ├── claude-guide/     설명
│   ├── github-guide.html 🐙 깃허브 첫걸음 (웹 안내서)
│   └── github-guide/     설명
└── images/              원숭이별 게임 화면
```

<br>

<div align="center">

🍓 **딸기농장** · 호기심으로 만든 것들은 <a href="https://github.com/berryst41/toy-store">toy-store</a>에 있어요

</div>
