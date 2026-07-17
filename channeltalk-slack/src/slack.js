// Slack 연동.
// - 고객 문의 원문 + Claude 초안을 채널에 게시 (승인/무시 버튼 포함)
// - 버튼 클릭(interactivity) 요청의 서명 검증
// - 초안 발송 후 메시지 갱신

import crypto from 'node:crypto';
import { config } from './config.js';

async function slackApi(method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.slack.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method} 실패: ${data.error}`);
  return data;
}

/**
 * 고객 문의 + 구조화된 초안을 Slack 채널에 게시.
 * `result` 는 claude.generateDraft 의 반환 객체(category, is_escalation, draft, agent_note, ...).
 * 버튼의 value 에 userChatId 를 실어 나중에 어느 상담에 답장할지 식별한다.
 */
export function buildBlocks({ customerName, customerMessage, result, isReply }) {
  const { category, is_escalation, draft } = result;

  // 태그 + 에스컬레이션 배지
  const badges = [`\`${category ?? '기타'}\``];
  if (is_escalation) badges.push('🚨 *확인 후 안내(에스컬레이션)*');

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: isReply ? `💬 ${customerName} 님의 추가 메시지` : `📨 ${customerName} 님의 새 문의`,
        emoji: true,
      },
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: badges.join('  ·  ') }] },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*고객 문의*\n>${customerMessage.replace(/\n/g, '\n>')}` },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*🤖 추천 답변 초안*\n${draft}` },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: is_escalation
            ? '⚠️ 확인 후 안내 대상입니다. 초안은 표준 안내 문구이니, 실제 확인·처리는 담당 부서로 넘기세요.'
            : '💡 초안은 참고용입니다. 맥락에 맞게 다듬어 채널톡에서 직접 답변해 주세요.',
        },
      ],
    },
  ];
}

export async function postInquiry(args) {
  const body = {
    channel: config.slack.channelId,
    text: `${args.customerName} 님의 ${args.threadTs ? '추가 메시지' : '새 문의'}`, // 알림 fallback
    blocks: buildBlocks({ ...args, isReply: !!args.threadTs }),
    // 화면엔 안 보이지만 메시지에 상담ID를 심어둔다. 스레드 묶기(findThreadTs)가
    // 나중에 같은 상담의 원본 카드를 찾을 때 이 값을 읽는다.
    metadata: { event_type: 'vibeon_inquiry', event_payload: { userChatId: args.userChatId } },
  };
  if (args.threadTs) body.thread_ts = args.threadTs; // 같은 상담이면 스레드(댓글)로 추가
  return slackApi('chat.postMessage', body);
}

// 메시지에서 상담ID(userChatId)를 꺼낸다.
// 우선 메시지 메타데이터에서, 없으면 (구버전 카드의) 버튼 value 에서 읽는다.
function extractUserChatId(message) {
  const fromMeta = message.metadata?.event_payload?.userChatId;
  if (fromMeta) return fromMeta;
  const actions = (message.blocks ?? []).find((b) => b.type === 'actions');
  const btn = actions?.elements?.find((e) => e.value);
  if (!btn) return null;
  try {
    return JSON.parse(btn.value).userChatId ?? null;
  } catch {
    return null;
  }
}

/**
 * 채널의 최근 메시지를 뒤져 같은 상담(userChatId)의 '부모' 카드를 찾아 그 ts 를 돌려준다.
 * 서버가 재시작/휴면으로 메모리를 잃어도 슬랙에 남은 메시지로 스레드를 이어갈 수 있게 한다.
 * (conversations.history 는 스레드 답글을 제외한 부모 메시지만 반환하므로 원본 카드가 잡힌다.)
 * 필요 권한(scope): channels:history (공개 채널) 또는 groups:history (비공개 채널).
 */
export async function findThreadTs({ userChatId, ttlMs }) {
  const oldest = Math.floor((Date.now() - ttlMs) / 1000);
  const params = new URLSearchParams({
    channel: config.slack.channelId,
    limit: '100',
    oldest: String(oldest),
    include_all_metadata: 'true', // 메시지에 심어둔 상담ID(metadata)를 함께 받기 위함
  });
  const res = await fetch(`https://slack.com/api/conversations.history?${params}`, {
    headers: { Authorization: `Bearer ${config.slack.botToken}` },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack conversations.history 실패: ${data.error}`);

  // 최신 → 과거 순. 부모 메시지 중 userChatId 가 일치하는 첫 항목의 ts.
  for (const m of data.messages ?? []) {
    if (m.thread_ts && m.thread_ts !== m.ts) continue; // 스레드 답글은 스킵
    if (extractUserChatId(m) === userChatId) return m.ts;
  }
  return undefined;
}

/** 버튼 처리 후 원본 메시지를 결과 텍스트로 교체 */
export async function updateMessage({ channel, ts, text }) {
  return slackApi('chat.update', { channel, ts, text, blocks: [
    { type: 'section', text: { type: 'mrkdwn', text } },
  ] });
}

/**
 * Slack 요청 서명 검증.
 * 문서: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature({ rawBody, timestamp, signature }) {
  if (!config.slack.signingSecret) return true; // 개발 편의: 미설정 시 통과
  if (!timestamp || !signature) return false;
  // 재전송 공격 방지: 5분 이상 지난 요청 거부
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected =
    'v0=' + crypto.createHmac('sha256', config.slack.signingSecret).update(base).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
