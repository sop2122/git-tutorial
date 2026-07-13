# 채널톡 → Slack 답변 초안 중계 서버

채널톡에 고객 메시지가 들어오면 **Slack으로 전달**하고, 이전 대화 히스토리와 FAQ를 바탕으로 **Claude가 답변 초안을 자동 생성**해 함께 보여줍니다. 상담원은 Slack에서 버튼 한 번으로 초안을 고객에게 발송할 수 있습니다.

## 플로우

```
채널톡 (고객 메시지 인입)
   │  Webhook: POST /webhook/channeltalk
   ▼
중계 서버
   1) 상담 히스토리 조회 (채널톡 Open API)
   2) FAQ + 히스토리로 Claude 초안 생성
   3) Slack 채널에 게시
        └ 고객 원문 + 🤖 추천 답변 초안 + [✅ 이대로 보내기] / [🙈 무시]
   ▼
상담원이 Slack 버튼 클릭
   │  Interactivity: POST /slack/interactivity
   ▼
[✅ 이대로 보내기] → 채널톡 Open API로 고객에게 답장 전송
```

## 파일 구조

```
channeltalk-slack/
├── server.js            # Express 서버 (Webhook + Slack interactivity 라우트)
├── src/
│   ├── config.js        # 환경 변수 로딩/검증
│   ├── channeltalk.js   # 채널톡 Open API (히스토리 조회, 답장 전송, 서명 검증)
│   ├── claude.js        # Claude API로 답변 초안 생성
│   ├── slack.js         # Slack 게시(Block Kit) + 버튼 서명 검증
│   └── faq.js           # FAQ 로더
├── data/
│   └── faq.md           # FAQ/정책 (실제 내용으로 교체)
└── .env.example         # 환경 변수 템플릿
```

## 시작하기

### 1. 설치

```bash
cd channeltalk-slack
npm install
cp .env.example .env        # 값 채우기
cp data/faq.example.md data/faq.md   # 실제 CS 지식 베이스로 채우기 (저장소에 안 올라감)
```

### 2. 환경 변수 (`.env`)

| 변수 | 발급 위치 |
|---|---|
| `CHANNELTALK_ACCESS_KEY` / `CHANNELTALK_ACCESS_SECRET` | 채널톡 관리자 > 설정 > 보안/개발 > API 액세스 키 |
| `CHANNELTALK_WEBHOOK_SECRET` | 채널톡 Webhook 등록 시 서명 시크릿 |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `SLACK_BOT_TOKEN` | Slack 앱 > OAuth & Permissions (`chat:write` 스코프) |
| `SLACK_CHANNEL_ID` | 문의를 게시할 채널 ID |
| `SLACK_SIGNING_SECRET` | Slack 앱 > Basic Information |

### 3. 실행

```bash
npm start                       # = node --env-file=.env server.js 는 아래처럼
node --env-file=.env server.js  # Node 20+ (.env 자동 로딩)
```

> `npm start`는 `.env`를 자동 로딩하지 않습니다. `.env`를 쓰려면 `node --env-file=.env server.js`로 실행하거나, 셸에서 변수를 export하세요.

## 외부 서비스 설정

### 채널톡 Webhook 등록
1. 채널톡 관리자 > 설정 > 보안/개발 > **Webhook** 추가
2. URL: `https://<배포주소>/webhook/channeltalk`
3. 구독 이벤트: **메시지(userChat)** 생성
4. 서명 시크릿을 `CHANNELTALK_WEBHOOK_SECRET`에 저장

### Slack 앱 설정
1. https://api.slack.com/apps 에서 앱 생성
2. **OAuth & Permissions** → `chat:write` 추가 → 워크스페이스에 설치 → Bot Token 복사
3. **Interactivity & Shortcuts** → ON → Request URL: `https://<배포주소>/slack/interactivity`
4. 봇을 대상 채널에 초대 (`/invite @앱이름`)

로컬 개발 시에는 `ngrok http 3000` 등으로 공개 URL을 만들어 위 두 URL에 넣으세요.

## 동작 검증 (외부 키 없이)

```bash
node --check server.js          # 문법 검사
curl localhost:3000/health      # {"status":"ok"}
```

## 실서비스 전 고려사항

- **FAQ 정확도**: 현재는 `faq.md` 전체를 프롬프트에 넣습니다. FAQ가 커지면 임베딩 기반 검색(RAG)으로 관련 항목만 넣는 방식을 권장합니다. (`src/faq.js` 주석 참고)
- **초안 수정 후 발송**: 현재 [이대로 보내기]는 초안 원문을 그대로 전송합니다. Slack Modal을 붙이면 발송 전 수정도 가능합니다.
- **큐/재시도**: 대량 트래픽에서는 Webhook 수신 즉시 큐에 넣고 워커가 처리하도록 분리하세요. (현재는 즉시 200 응답 후 비동기 처리)
- **API 엔드포인트 버전**: 채널톡 Open API 경로는 v5 기준입니다. 최신 문서(https://developers.channel.io)로 확인하세요.
