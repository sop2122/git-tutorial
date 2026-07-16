// FAQ 로더. 데모에서는 data/faq.md 파일을 통째로 읽어 Claude 프롬프트에 넣는다.
// 실서비스에서는 FAQ를 임베딩해 벡터 검색(RAG)으로 관련 항목만 뽑아 넣는 것을 권장.
// (예: 문의 텍스트로 top-k 검색 후 해당 청크만 컨텍스트에 삽입)

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAQ_PATH = join(__dirname, '..', 'data', 'faq.md');

let cache = null;

export async function loadFaq() {
  if (cache !== null) return cache;
  // 호스팅 배포 환경에서는 지식 베이스를 파일 대신 환경변수(FAQ_CONTENT)로 주입할 수 있다.
  // (data/faq.md 는 공개 저장소에 올리지 않으므로) 환경변수가 있으면 그것을 우선 사용.
  const fromEnv = process.env.FAQ_CONTENT;
  if (fromEnv && fromEnv.trim()) {
    cache = fromEnv;
    return cache;
  }
  try {
    cache = await readFile(FAQ_PATH, 'utf-8');
  } catch {
    cache = '';
  }
  return cache;
}
