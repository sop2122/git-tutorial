// 채널톡 Open API 클라이언트.
// - 상담(userChat)의 이전 대화 히스토리 조회
// - 매니저(봇) 이름으로 고객에게 답장 전송
//
// 엔드포인트는 채널톡 Open API v5 기준입니다. 버전이 바뀌면 baseUrl/경로를 조정하세요.
// 문서: https://developers.channel.io/

import crypto from 'node:crypto';
import { config } from './config.js';

function authHeaders() {
  return {
    'x-access-key': config.channeltalk.accessKey,
    'x-access-secret': config.channeltalk.accessSecret,
    'Content-Type': 'application/json',
  };
}

/**
 * 채널톡 Webhook 서명 검증.
 * 채널톡은 요청 본문(raw body)을 webhookSecret 으로 HMAC-SHA256 서명해
 * `x-signature` 헤더로 보냅니다. 시크릿이 설정되지 않았으면 검증을 건너뜁니다.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!config.channeltalk.webhookSecret) return true; // 개발 편의: 미설정 시 통과
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', config.channeltalk.webhookSecret)
    .update(rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/**
 * Webhook 페이로드에서 우리가 필요한 정보만 정규화해서 추출한다.
 * personType === 'user' 인 메시지(=고객 발화)만 처리 대상이다.
 */
export function parseWebhook(payload) {
  const entity = payload?.entity ?? {};
  const refers = payload?.refers ?? {};
  return {
    isUserMessage: entity.personType === 'user',
    userChatId: entity.chatId ?? refers.userChat?.id,
    text: entity.plainText ?? '',
    customerName: refers.user?.name ?? refers.user?.profile?.name ?? '고객',
    createdAt: entity.createdAt,
  };
}

/**
 * 특정 상담의 최근 메시지 히스토리를 시간순으로 반환한다.
 * @returns {Promise<Array<{ who: 'user'|'manager'|'bot', text: string }>>}
 */
export async function fetchChatHistory(userChatId, limit = 20) {
  if (!userChatId) return [];
  const url = new URL(`${config.channeltalk.baseUrl}/open/v5/user-chats/${userChatId}/messages`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sortOrder', 'desc');

  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`채널톡 히스토리 조회 실패: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const messages = data.messages ?? [];

  return messages
    .map((m) => ({
      who: m.personType === 'user' ? 'user' : m.personType === 'bot' ? 'bot' : 'manager',
      text: m.plainText ?? '',
    }))
    .filter((m) => m.text)
    .reverse(); // desc 로 받아서 오래된 순으로 뒤집음
}

/**
 * 매니저(봇) 이름으로 고객에게 답장을 전송한다.
 * Slack 에서 승인 버튼을 눌렀을 때 호출된다.
 */
export async function sendManagerMessage(userChatId, text) {
  const url = new URL(`${config.channeltalk.baseUrl}/open/v5/user-chats/${userChatId}/messages`);
  url.searchParams.set('botName', config.channeltalk.botName);

  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ blocks: [{ type: 'text', value: text }] }),
  });
  if (!res.ok) {
    throw new Error(`채널톡 답장 전송 실패: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
