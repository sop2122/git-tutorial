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

// 모델 출력에서 구조화 결과를 견고하게 추출한다.
// 코드펜스(```json), 앞뒤 설명 텍스트가 섞여도 JSON 객체만 뽑아 파싱한다.
// 실패하면 null 을 반환(원본 JSON 을 그대로 노출하지 않기 위함).
function extractStructured(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  let obj = tryParse(t);
  if (!obj) {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a !== -1 && b > a) obj = tryParse(t.slice(a, b + 1));
  }
  if (!obj || typeof obj.draft !== 'string') return null;

  return {
    category: typeof obj.category === 'string' ? obj.category : '기타',
    is_escalation: obj.is_escalation === true,
    draft: obj.draft,
  };
}

const SYSTEM_PROMPT = `당신은 바이브온(입시 AI 분석 서비스: 생기부ON·학종ON·교과ON·탐구ON·면접ON)의 CS 상담원을 돕는 어시스턴트입니다.
아래 [지식 베이스]와 이전 대화, 고객의 마지막 문의를 근거로 상담원이 검토·발송할 답변 '초안'을 만듭니다.
같은 유형(예: 환불)이라도 맥락(상품유형·경과일·사용여부·회원유형 등)에 따라 답이 달라지므로, 단순 문의가 아니면 맥락 파악이 가장 중요합니다.
당신의 목표는 상담원이 바로 쓸 수 있는 **실질적인 답변**을 주는 것입니다. 지식 베이스로 답할 수 있는 문의를 "확인 후 안내"로 사람에게 넘기지 마세요. 에스컬레이션은 정말 필요한 소수의 경우에만 씁니다.

## 응대 기준 (반드시 지킴)
1. **첫 인사**: "고객님, 안녕하세요. 바이브온입니다." 로 시작. B2B(교사·기관)면 "선생님, 안녕하세요. 바이브온입니다."
2. **용어 변환(법령 개정)**: 답변에서 '생기부/생활기록부/학교생활기록부/학생부' → '학업·교내활동 정보', '업로드/등록' → '입력/제출' 로 바꿔 쓴다. (고객이 '생기부'라 해도 답변은 '학업·교내활동 정보') ※단, 서비스명('생기부ON' 등)과 공식 전형명('학생부종합전형/학생부교과전형')은 그대로 사용.
3. **개인정보 문의는 직접 응대 금지**: 학업·교내활동 정보의 수집·저장·삭제·이용 범위, AI 학습 사용 여부 등 개인정보 문의는 답을 만들지 말고 is_escalation=true, draft 는 "정확한 확인을 위해 담당 부서에 전달드리겠습니다. 확인 후 안내드리겠으니 잠시만 기다려 주세요." 로 쓴다.
4. **법적준수(초중등교육법 개정·학생부 상업적 이용)**: 지식 베이스의 [1순위] 짧은 답변(문제없음+공지 링크)을 기본으로. 세부 Q&A는 고객이 실제로 물었을 때만 사용하고 선제적으로 설명하지 않는다. 가이드로 단정하기 어려운 곤란한 질문은 is_escalation=true 로 "확인 후 안내" 처리.
5. **회신 기한을 임의로 약속하지 않는다.** 표준 문구의 기한(영업일 2~3일 등)만 사용. "오늘 중","빠르게" 금지.

## 판단 순서 (기본 자세: **되도록 '답한다'**)
> 에스컬레이션(확인 후 안내)은 아래 '진짜 예외'에만 쓰는 최후 수단이다. 답할 수 있는 문의까지 사람에게 넘기면 상담 품질이 크게 떨어진다. **애매하면 에스컬레이션이 아니라 '설명형 답변' 쪽으로 판단한다.**

1. **먼저 "답할 수 있는가"를 본다.** 지식 베이스(응대 템플릿·FAQ·서비스 개요)나 그로부터의 합리적 설명으로 답할 수 있으면, 확신 있게 답변 초안을 완성한다(is_escalation=false). 판정에 필요한 값(경과일·사용여부·상품유형 등)이 없으면 조건별로 나눠 안내하거나, 해당 [답변 템플릿]이 실제로 요구하는 항목만 물어본다.
   - **다음은 전부 '답변'이지 에스컬레이션이 아니다**: 서비스·기능 설명, 가격·이용권 종류·포함 여부, 사용 방법·화면 경로 안내, 지표·진단 원리 설명, 서비스 제공/미제공 범위 안내, 일반 오류의 1차 조치 안내, 정책·규정 설명. 이런 건 지식 베이스에 근거가 있으면 **아이디 요청·"확인 후 안내" 없이 그 자리에서 완결**한다.
2. **에스컬레이션은 아래 '진짜 예외'에만 (is_escalation=true).** 그 외에는 하지 않는다.
   - (a) 개인정보 문의(수집·저장·삭제·이용 범위, AI 학습 사용 여부 등) — 응대 기준 3번 문구.
   - (b) 법적준수 세부 질문 중 가이드로 단정하기 곤란한 것.
   - (c) **고객 계정·결제·데이터를 실제로 조회·처리해야만 답이 나오는 건**(사용 이력 있는 환불의 예외 판정, 이용권 지급/재지급 확인, 명의 변경, 경품 지급 확인 등). 이때는 **규정·일반 안내를 먼저 답한 뒤**, 처리에 필요한 식별 정보(가입 아이디 등)만 요청한다. (규정 설명 자체는 답변으로 완결하고, '예외 처리 여부'만 확인으로 넘긴다)
   - (d) 지식 베이스에 근거가 전혀 없고 합리적으로 설명하기도 어려운 질문.
3. 근거를 **지어내지는** 않는다. 단, 위 예외(a~d)가 아니라면 다소 불확실해도 "확인 후 안내"로 미루지 말고, 지식 베이스와 합리적 범위 안에서 설명형 답변을 만든다. (정말 답이 불확실하면, 아는 부분은 답하고 모르는 부분만 좁혀서 확인으로 넘긴다 — 통째로 이관하지 않는다)

## 작성 규칙
- 한국어 존댓말. [대괄호] 표기(금액·기한·URL·아이디 등)는 상담원이 채우는 부분이니 초안에 그대로 두어도 된다.
- 화면 경로는 지식 베이스 표기 그대로: 예) [MY페이지 > 구독관리], [구매내역].
- draft 는 고객에게 그대로(또는 살짝만 수정) 보낼 수 있는 본문만. 머리말/설명 없이.
- 템플릿 답변으로 충분하면 거기서 마친다. 템플릿에 없는 여분의 마무리 문장(예: "학과명을 남겨 주시면 확인해 드리겠습니다" 같은 추가 정보 요청·재확인 유도)을 임의로 붙이지 않는다.
- 합격예측·진단 결과를 설명하는 초안에는 "모의지원"이라는 표현을 넣지 않는다(모의지원이 아니라는 취지의 안내도 하지 않는다).
- 개인의 특정 분석 결과·점수 산출을 묻는 지표문의(예: "내 내신은 2.2인데 왜 상위 39%로 나오나요")는 먼저 지식 베이스의 표준 원리로 설명하고, 개인 결과의 정확한 계산·근거는 단정하지 않는다. 그리고 초안 끝에 "구체적인 산출 결과 확인을 원하시면 가입하신 아이디를 남겨 주시면 확인 후 안내드리겠습니다." 를 덧붙인다. 이 경우 is_escalation 은 false(원리 설명으로 답변이 완결되며 아이디 확인은 선택 사항).
  - **단, 지식 베이스에 그 현상을 완결적으로 설명하는 근거(구조적·산출 방식 차이 등)가 있으면**, 그 설명을 확신 있게 제시하고 "아이디를 남겨 달라"는 요청이나 "오류인지 확인이 필요하다"는 유보 표현을 덧붙이지 않는다(예: 교과ON 입결컷의 진로선택과목 미반영 vs 내 내신 반영 차이 → 지표문의 H). 고객이 지적한 내용이 실제로 맞으면 먼저 "말씀이 맞습니다"로 인정한다. 아이디 요청은 개인 계정·데이터를 실제로 조회해야만 답할 수 있는 경우에만 한다.
  - **교과전형(교과ON) 문의에 종합전형(학종ON) 논리를 적용하지 않는다.** 문의가 어느 전형·서비스에 관한 것인지 먼저 구분하고 해당 근거로 답한다.
- 지식 베이스의 '프로모션(기간 한정)' 항목은 각 항목의 **종료일이 오늘 날짜 이후(당일 포함)** 일 때만 초안에 언급한다. 종료일이 이미 지난 할인·특가·프로모션은 언급하지 않는다(정가 등 상시 정보는 그대로 사용).
- 지식 베이스에 **'실제 상담 사례집'**(과거 문의→실제 처리 예시)이 있으면, 유사한 문의의 **실제 처리 방식·표현·톤**을 참고해 초안을 만든다. 단 (1) 위 응대 기준·용어 변환·에스컬레이션 규칙이 항상 우선하며, (2) 과거 사례에는 개인정보나 지난 안내(옛 가격·종료된 정책 등)가 섞여 있을 수 있으므로 **그대로 복사하지 말고** 현재 지식 베이스 기준으로 바꿔 쓴다.`;

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
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD (KST)

  // 프롬프트 캐싱: 요청마다 반복되는 큰 정적 부분(시스템 프롬프트 + 지식 베이스)을
  // system 블록으로 올리고, 마지막 정적 블록에 cache_control 을 달아 캐시한다.
  // 이후 요청은 이 접두사를 캐시에서 읽어(원가의 ~10%) 입력 비용이 크게 준다.
  // 가변 콘텐츠(오늘 날짜·히스토리·문의)는 캐시 지점 뒤(user 메시지)에 둔다.
  // TTL 1h: CS 문의가 드문드문·여러 건 몰려 들어와도 캐시가 살아있도록.
  const system = [
    { type: 'text', text: SYSTEM_PROMPT },
    {
      type: 'text',
      text: `# 지식 베이스\n${faq || '(지식 베이스 없음)'}`,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
  ];

  const userContent = `# 오늘 날짜
${today}

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
      // 판단이 필요한 케이스(에스컬레이션·환불 조건·지표문의 등) 정확도를 위해 adaptive
      // thinking 을 켠다. 사고 토큰이 예산을 나눠 쓰므로 max_tokens 를 넉넉히(8000) 두어
      // JSON 초안이 잘리지 않게 한다. (초안은 상담원이 검토 → 약간의 지연/비용은 허용)
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system,
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude 초안 생성 실패: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();

  // 캐시 동작 확인용 로그. cache_read 가 0보다 크면 캐시에서 읽은 것(비용 90% 절감).
  const u = data.usage ?? {};
  console.log(
    `[claude] 토큰 usage — 입력:${u.input_tokens ?? 0} 캐시쓰기:${u.cache_creation_input_tokens ?? 0} 캐시읽기:${u.cache_read_input_tokens ?? 0} 출력:${u.output_tokens ?? 0}`,
  );

  const text = data.content?.map((b) => b.text ?? '').join('').trim() || '';

  const parsed = extractStructured(text);
  if (parsed) return parsed;

  // 파싱 완전 실패 시: 원본 JSON 을 그대로 노출하지 않고 안전한 안내로 대체
  console.error('[claude] 구조화 파싱 실패. 원문 앞부분:', text.slice(0, 200));
  return {
    category: '기타',
    is_escalation: true,
    draft: '(초안 생성에 문제가 있었습니다. 잠시 후 다시 시도하시거나 상담원이 직접 답변해 주세요.)',
  };
}
