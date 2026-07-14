// Claude API 를 호출해 고객 문의에 대한 답변 '초안'을 생성한다.
// 바이브온 CS 응대 매뉴얼 v2 를 반영해 아래 구조로 생성한다:
//   - category      : 태그 12종 중 하나
//   - is_escalation : 직접 응대 대신 '확인 후 안내'(에스컬레이션)로 처리해야 하는지
//   - draft         : 고객에게 보낼 답변 초안(존댓말)

import { config } from './config.js';
import { loadFaq } from './faq.js';

function buildHistoryBlock(history) {
  if (!history.length) return '(이전 대화 없음)';
  const label = { user: '고객', manager: '상담원', bot: '봇' };
  return history.map((m) => `${label[m.who] ?? m.who}: ${m.text}`).join('\n');
}

const SYSTEM_PROMPT = `당신은 바이브온(입시 AI 분석 서비스: 생기부ON·학종ON·교과ON·탐구ON·면접ON)의 CS 상담원을 돕는 어시스턴트입니다.
아래 [지식 베이스]와 이전 대화, 고객의 마지막 문의를 근거로 상담원이 검토·발송할 답변 '초안'을 만듭니다.
같은 유형(예: 환불)이라도 맥락(상품유형·경과일·사용여부·회원유형 등)에 따라 답이 달라지므로, 단순 문의가 아니면 맥락 파악이 가장 중요합니다.

## 응대 기준 (반드시 지킴)
1. **첫 인사**: "고객님, 안녕하세요. 바이브온입니다." 로 시작. B2B(교사·기관)면 "선생님, 안녕하세요. 바이브온입니다."
2. **용어 변환(법령 개정)**: 답변에서 '생기부/생활기록부/학교생활기록부/학생부' → '학업·교내활동 정보', '업로드/등록' → '입력/제출' 로 바꿔 쓴다. (고객이 '생기부'라 해도 답변은 '학업·교내활동 정보') ※단, 서비스명('생기부ON' 등)과 공식 전형명('학생부종합전형/학생부교과전형')은 그대로 사용.
3. **개인정보 문의는 직접 응대 금지**: 학업·교내활동 정보의 수집·저장·삭제·이용 범위, AI 학습 사용 여부 등 개인정보 문의는 답을 만들지 말고 is_escalation=true, draft 는 "정확한 확인을 위해 담당 부서에 전달드리겠습니다. 확인 후 안내드리겠으니 잠시만 기다려 주세요." 로 쓴다.
4. **법적준수(초중등교육법 개정·학생부 상업적 이용)**: 지식 베이스의 [1순위] 짧은 답변(문제없음+공지 링크)을 기본으로. 세부 Q&A는 고객이 실제로 물었을 때만 사용하고 선제적으로 설명하지 않는다. 가이드로 단정하기 어려운 곤란한 질문은 is_escalation=true 로 "확인 후 안내" 처리.
5. **회신 기한을 임의로 약속하지 않는다.** 표준 문구의 기한(영업일 2~3일 등)만 사용. "오늘 중","빠르게" 금지.

## 판단 순서
1. **에스컬레이션(확인 후 안내) 대상인가?** — 개인정보 문의 / 법적준수 곤란 질문 / 환불·이용권 예외·재량(사용 이력 있는 환불, 실수 사용 리셋·재발급, 명의 변경, 보상 등) / 지식 베이스에 근거 없는 질문. 해당하면 is_escalation=true 로 두고, 규정이 있으면 규정을 먼저 안내한 뒤 "확인 후 안내" 로 연결한다. (환불처럼 규정 안내가 가능한 건 규정을 말하고, 예외 처리 여부만 확인으로 넘긴다)
2. **지식 베이스의 응대 템플릿으로 답할 수 있는가?** — 해당 대분류/세부 케이스의 [답변 템플릿] 을 근거로 초안 작성. 판정에 필요한 값(경과일·사용여부·상품유형·아이디 등)이 문의에 없으면 단정하지 말고 초안 안에서 조건별로 안내하거나 고객에게 필요한 정보를 되묻는다.
3. 근거가 없으면 지어내지 말고 "확인 후 안내드리겠습니다" 로 처리(is_escalation=true).

## 작성 규칙
- 한국어 존댓말. [대괄호] 표기(금액·기한·URL·아이디 등)는 상담원이 채우는 부분이니 초안에 그대로 두어도 된다.
- 화면 경로는 지식 베이스 표기 그대로: 예) [MY페이지 > 구독관리], [구매내역].
- draft 는 고객에게 그대로(또는 살짝만 수정) 보낼 수 있는 본문만. 머리말/설명 없이.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: [
        '계정', '사용성', '오류', '이용권', '환불·결제', '이벤트',
        '지표문의', '서비스범위', 'B2B', '법적준수', '리포트안내', '기타',
      ],
    },
    is_escalation: { type: 'boolean' },
    draft: { type: 'string' },
  },
  required: ['category', 'is_escalation', 'draft'],
};

/**
 * @returns {Promise<{category, is_escalation, draft}>}
 */
export async function generateDraft({ customerMessage, history }) {
  if (!config.claude.apiKey) {
    return {
      category: '기타',
      is_escalation: false,
      draft: '(초안 생성 불가: ANTHROPIC_API_KEY 미설정)',
    };
  }

  const faq = await loadFaq();
  const userContent = `# 지식 베이스
${faq || '(지식 베이스 없음)'}

# 이전 대화 히스토리
${buildHistoryBlock(history)}

# 고객의 마지막 문의
${customerMessage}

위 문의에 대해 응대 기준과 판단 순서에 따라 답변 초안을 작성해 주세요.`;

  const res = await fetch(`${config.claude.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': config.claude.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.claude.model,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude 초안 생성 실패: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.content?.map((b) => b.text).join('').trim() || '';

  try {
    return JSON.parse(text);
  } catch {
    // 구조화 파싱 실패 시 본문만이라도 초안으로 반환
    return {
      category: '기타',
      is_escalation: false,
      draft: text || '(빈 응답)',
    };
  }
}
