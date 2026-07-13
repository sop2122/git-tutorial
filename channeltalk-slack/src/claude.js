// Claude API 를 호출해 고객 문의에 대한 답변 '초안'을 생성한다.
// 바이브온 CS 체계(D형 즉시이관 → 매크로 → 정책 1차판정 → 내부조회) 를 반영해,
// 단순 답변이 아니라 아래 구조로 생성한다:
//   - category      : 태그 10종 중 하나
//   - is_escalation : D형 즉시이관 여부
//   - branch_id     : 해당 SSOT 분기ID(R-02 등), 없으면 ""
//   - draft         : 고객에게 보낼 답변 초안(존댓말)
//   - agent_note    : 상담원 참고(어느 분기/무엇을 확인/이관 필요)
//   - missing_info  : 초안 확정에 더 필요한 정보 목록

import { config } from './config.js';
import { loadFaq } from './faq.js';

function buildHistoryBlock(history) {
  if (!history.length) return '(이전 대화 없음)';
  const label = { user: '고객', manager: '상담원', bot: '봇' };
  return history.map((m) => `${label[m.who] ?? m.who}: ${m.text}`).join('\n');
}

const SYSTEM_PROMPT = `당신은 바이브온(생기부 기반 입시 분석 서비스)의 CS 상담원을 돕는 어시스턴트입니다.
아래 [지식 베이스]와 이전 대화, 고객의 마지막 문의를 근거로 상담원이 검토·발송할 답변 '초안'과 참고 정보를 만듭니다.

이 서비스는 같은 유형의 문의(예: 환불)라도 맥락(상품유형·경과일·사용여부·회원유형 등)에 따라 답이 달라집니다. 단순 문의가 아니면 맥락 파악이 가장 중요합니다.

## 판단 순서 (반드시 이 순서로)
1. **D형(즉시이관) 신호가 있는가?** — 법령·기관/언론·개인정보 권리·보상/복구 재량 요구·환불원칙 불복·지표/알고리즘 설명 요구(승인된 표준답변 범위 외)·민원성. 하나라도 있으면 is_escalation=true, draft 는 D형 표준 한 문장만 쓰고 그 이상 답하지 않는다.
2. **매크로에 있는 단순 질문인가?** — 지식 베이스의 승인된 매크로 문구를 근거로 초안 작성.
3. **정책 기준 1차 판정이 가능한가?** — 환불/구독/이용권 판단 트리에서 해당 분기를 찾아 branch_id 로 기록. 판정에 필요한 입력값(경과일·사용여부·상품유형 등)이 문의에 없으면, 단정하지 말고 초안 안에서 조건별로 안내하거나 고객에게 필요한 정보를 되묻는다.
4. **내부 조회·조치가 필요한가?** — 표준 중간 안내 문구로 초안을 쓴다.

## 작성 규칙
- 한국어 존댓말. 초안 시작은 보통 "고객님, 안녕하세요." 로.
- **회신 기한을 임의로 약속하지 않는다.** 표준 문구의 기한(영업일 1일/2일 등)만 사용. "오늘 중", "빠르게" 금지.
- 지식 베이스에 근거가 없으면 사실을 지어내지 말고 "확인 후 안내드리겠습니다"로 처리.
- 화면 경로는 지식 베이스 표기 그대로: 예) [MY페이지 > 구독관리], [구매내역].
- 판단 트리에서 '단정 금지/기획자 재량'으로 표시된 건(R-08/09, T-30~32/60 등)은 가능/불가를 단정하지 말고 "확인 후 안내"로 쓰고 is_escalation=true.
- draft 는 고객에게 그대로(또는 살짝만 수정) 보낼 수 있는 본문만. 머리말/설명 없이.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: ['이용권', '환불·결제', '이벤트', '사용성', '오류', '계정', '지표문의', '서비스범위', 'B2B', '기타'],
    },
    is_escalation: { type: 'boolean' },
    branch_id: { type: 'string' },
    draft: { type: 'string' },
  },
  required: ['category', 'is_escalation', 'branch_id', 'draft'],
};

/**
 * @returns {Promise<{category,is_escalation,branch_id,draft,agent_note,missing_info}>}
 */
export async function generateDraft({ customerMessage, history }) {
  if (!config.claude.apiKey) {
    return {
      category: '기타',
      is_escalation: false,
      branch_id: '',
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

위 문의에 대해 판단 순서에 따라 초안과 참고 정보를 작성해 주세요.`;

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
      branch_id: '',
      draft: text || '(빈 응답)',
    };
  }
}
