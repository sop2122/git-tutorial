// 채널톡 → Slack → 채널톡 중계 서버.
//
// 플로우:
//   1) 채널톡 Webhook 으로 고객 메시지 수신          (POST /webhook/channeltalk)
//   2) 상담 히스토리 조회 + FAQ 로 Claude 초안 생성
//   3) 고객 문의 + 초안을 Slack 채널에 게시(승인 버튼)
//   4) 상담원이 Slack 버튼 클릭                       (POST /slack/interactivity)
//   5) '이대로 보내기' 시 채널톡 Open API 로 고객에게 답장
//
// 실행: node --env-file=.env server.js   (Node 20+)

import express from 'express';
import { config } from './src/config.js';
import {
  verifyWebhookSignature,
  parseWebhook,
  fetchChatHistory,
  sendManagerMessage,
} from './src/channeltalk.js';
import { generateDraft } from './src/claude.js';
import { postInquiry, updateMessage, verifySlackSignature } from './src/slack.js';

const app = express();

// ── 채널톡 Webhook ──────────────────────────────────────
// 서명 검증을 위해 raw body 가 필요하므로 express.json 의 verify 훅으로 원본을 보관.
app.post(
  '/webhook/channeltalk',
  express.json({ verify: (req, _res, buf) => (req.rawBody = buf.toString('utf-8')) }),
  async (req, res) => {
    if (!verifyWebhookSignature(req.rawBody ?? '', req.get('x-signature'))) {
      return res.status(401).send('invalid signature');
    }

    // 채널톡에는 즉시 200 을 응답하고(재시도 방지), 처리는 비동기로 진행.
    res.sendStatus(200);

    try {
      const msg = parseWebhook(req.body);
      if (!msg.isUserMessage || !msg.text || !msg.userChatId) return; // 고객 발화만 처리

      const history = await fetchChatHistory(msg.userChatId).catch((e) => {
        console.error('[history]', e.message);
        return [];
      });

      const draft = await generateDraft({ customerMessage: msg.text, history });

      await postInquiry({
        customerName: msg.customerName,
        customerMessage: msg.text,
        draft,
        userChatId: msg.userChatId,
      });
      console.log(`[ok] 문의 게시 완료 (userChat=${msg.userChatId})`);
    } catch (e) {
      console.error('[webhook] 처리 실패:', e.message);
    }
  },
);

// ── Slack Interactivity (버튼 클릭) ─────────────────────
// Slack 은 application/x-www-form-urlencoded 로 payload=<json> 을 보낸다.
app.post(
  '/slack/interactivity',
  express.urlencoded({ extended: true, verify: (req, _res, buf) => (req.rawBody = buf.toString('utf-8')) }),
  async (req, res) => {
    const ok = verifySlackSignature({
      rawBody: req.rawBody ?? '',
      timestamp: req.get('x-slack-request-timestamp'),
      signature: req.get('x-slack-signature'),
    });
    if (!ok) return res.status(401).send('invalid signature');

    res.sendStatus(200); // Slack 에 3초 내 응답

    try {
      const payload = JSON.parse(req.body.payload);
      const action = payload.actions?.[0];
      if (!action) return;

      const { userChatId, draft } = JSON.parse(action.value);
      const channel = payload.channel?.id;
      const ts = payload.message?.ts;
      const clicker = payload.user?.name ?? payload.user?.id ?? '상담원';

      if (action.action_id === 'send_draft') {
        await sendManagerMessage(userChatId, draft);
        await updateMessage({ channel, ts, text: `✅ *${clicker}* 님이 초안을 고객에게 발송했습니다.\n\n>${draft.replace(/\n/g, '\n>')}` });
        console.log(`[ok] 채널톡 답장 발송 (userChat=${userChatId})`);
      } else if (action.action_id === 'dismiss') {
        await updateMessage({ channel, ts, text: `🙈 *${clicker}* 님이 이 초안을 무시했습니다.` });
      }
    } catch (e) {
      console.error('[interactivity] 처리 실패:', e.message);
    }
  },
);

// ── 헬스체크 ────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(config.port, () => {
  console.log(`채널톡-슬랙 중계 서버 실행 중: http://localhost:${config.port}`);
  console.log(`  채널톡 Webhook   → POST /webhook/channeltalk`);
  console.log(`  Slack 버튼 처리  → POST /slack/interactivity`);
});
