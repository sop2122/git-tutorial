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
export function buildBlocks({ customerName, customerMessage, userChatId, result, isReply }) {
  const { category, is_escalation, branch_id, draft } = result;
  const payload = JSON.stringify({ userChatId, draft });

  // 태그 + 이관 배지
  const badges = [`\`${category ?? '기타'}\``];
  if (branch_id) badges.push(`\`${branch_id}\``);
  if (is_escalation) badges.push('🚨 *D형 즉시이관*');

  const blocks = [
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
  ];

  blocks.push(
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          style: is_escalation ? undefined : 'primary',
          text: { type: 'plain_text', text: '✅ 이대로 보내기', emoji: true },
          action_id: 'send_draft',
          value: payload,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '🙈 무시', emoji: true },
          action_id: 'dismiss',
          value: payload,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: is_escalation
            ? '⚠️ D형 이관 건입니다. 초안은 표준 이관 안내 문구예요 — 실제 처리는 담당 부서로 넘기세요.'
            : '초안을 수정해 보내려면 채널톡에서 직접 답장하세요. (버튼은 초안 원문 그대로 발송)',
        },
      ],
    },
  );

  return blocks;
}

export async function postInquiry(args) {
  const body = {
    channel: config.slack.channelId,
    text: `${args.customerName} 님의 ${args.threadTs ? '추가 메시지' : '새 문의'}`, // 알림 fallback
    blocks: buildBlocks({ ...args, isReply: !!args.threadTs }),
  };
  if (args.threadTs) body.thread_ts = args.threadTs; // 같은 상담이면 스레드(댓글)로 추가
  return slackApi('chat.postMessage', body);
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
