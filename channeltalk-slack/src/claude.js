// Claude API 를 호출해 고객 문의에 대한 답변 '초안'을 생성한다.
// 입력: 이번 문의 텍스트 + 이전 대화 히스토리 + FAQ
// 출력: 상담원이 검토/수정할 답변 초안 (그대로 보내도 될 수준을 목표로)

import { config } from './config.js';
import { loadFaq } from './faq.js';

function buildHistoryBlock(history) {
  if (!history.length) return '(이전 대화 없음)';
  const label = { user: '고객', manager: '상담원', bot: '봇' };
  return history.map((m) => `${label[m.who] ?? m.who}: ${m.text}`).join('\n');
}

const SYSTEM_PROMPT = `당신은 고객센터 상담원을 돕는 어시스턴트입니다.
아래 FAQ와 이전 대화 히스토리를 바탕으로, 고객의 마지막 문의에 대한 답변 '초안'을 작성하세요.

규칙:
- 한국어 존댓말로 작성합니다.
- 고객의 불편에 먼저 공감한 뒤 핵심 답변을 전달합니다.
- FAQ에 근거가 있는 내용만 사실로 단정합니다. 근거가 없으면 "확인 후 안내드리겠습니다"로 처리합니다.
- 개인정보를 요구하거나 추측성 정보를 지어내지 않습니다.
- 상담원이 그대로 보내거나 살짝만 수정하면 되도록, 답변 본문만 출력합니다. (머리말/설명 없이)`;

export async function generateDraft({ customerMessage, history }) {
  if (!config.claude.apiKey) {
    return '(초안 생성 불가: ANTHROPIC_API_KEY 미설정)';
  }

  const faq = await loadFaq();
  const userContent = `# FAQ / 정책
${faq || '(FAQ 없음)'}

# 이전 대화 히스토리
${buildHistoryBlock(history)}

# 고객의 마지막 문의
${customerMessage}

위 문의에 대한 답변 초안을 작성해 주세요.`;

  const res = await fetch(`${config.claude.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': config.claude.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.claude.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude 초안 생성 실패: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.content?.map((b) => b.text).join('').trim() || '(빈 응답)';
}
