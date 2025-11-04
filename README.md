# 📝 글쓰기 도우미

모바일 최적화된 3단계 글쓰기 플로우 앱입니다. 주제를 선택하고, 목차를 확인하며, 섹션별로 체계적으로 글을 작성할 수 있습니다.

## ✨ 주요 기능

### 📱 3개의 화면 플로우

#### 1. 글감 목록 화면
- 저장된 주제들을 카드 형태로 표시
- 카테고리, 진행률, 목차 미리보기 제공
- 삭제 기능
- 새 주제 추가 버튼

#### 2. 상세/시작 화면
- 주제 정보 상세 보기
- 목차 전체 확인 (완료 상태 표시)
- 진행률 바
- 탐구 시작/이어하기 버튼
- 목차/제목 수정 옵션

#### 3. 작성 화면
- 섹션별 작성 (textarea)
- 상단 진행률 표시
- 이전/다음 네비게이션
- 하단 섹션 바로가기
- 자동 저장 (1초 디바운스)
- 작성 가이드 제공
- 완료 표시

### 🎯 핵심 기능

- ✅ **진행률 실시간 표시** - 작성한 섹션 수에 따라 자동 계산
- ✅ **섹션별 완료 체크** - 50자 이상 작성시 자동 완료 처리
- ✅ **자동 저장** - 1초마다 로컬 스토리지에 자동 저장
- ✅ **부드러운 화면 전환** - 페이드인/슬라이드업 애니메이션
- ✅ **모바일 최적화** - 반응형 디자인으로 모든 기기 지원
- ✅ **직관적인 네비게이션** - 이전/다음 버튼, 빠른 섹션 이동

## 🚀 시작하기

### 실행 방법

1. 저장소 클론
```bash
git clone <repository-url>
cd git-tutorial
```

2. 브라우저에서 `index.html` 파일 열기
```bash
# 간단한 HTTP 서버 실행 (선택사항)
python3 -m http.server 8000
# 또는
npx serve
```

3. 브라우저에서 `http://localhost:8000` 접속

### 의존성

순수 HTML, CSS, JavaScript로 작성되어 **별도의 의존성이 없습니다**!

## 📖 사용 방법

### 1. 새 글감 추가하기
1. 메인 화면에서 "✨ 새 글감 추가하기" 버튼 클릭
2. 주제, 카테고리, 목차 입력
3. "추가하기" 버튼으로 저장

### 2. 글 작성하기
1. 목록에서 원하는 주제 카드 클릭
2. 상세 화면에서 "탐구 시작하기" 버튼 클릭
3. 각 섹션별로 내용 작성
4. 자동으로 저장되며, 이전/다음 버튼으로 이동

### 3. 진행 상황 확인
- 각 카드에 진행률 표시
- 상세 화면에서 완료된 섹션 체크 표시
- 작성 화면 상단에 실시간 진행률 바

## 🎨 기술 스택

- **HTML5** - 시맨틱 마크업
- **CSS3** - CSS 변수, Flexbox, 애니메이션
- **JavaScript (ES6+)** - 모듈 패턴, 로컬 스토리지
- **로컬 스토리지** - 데이터 영구 저장

## 📁 프로젝트 구조

```
git-tutorial/
├── index.html      # 메인 HTML 파일
├── styles.css      # 전체 스타일시트
├── app.js          # 앱 로직 및 상태 관리
└── README.md       # 프로젝트 문서
```

## 🎯 주요 컴포넌트

### AppState
전역 상태 관리 객체
- `topics`: 저장된 주제 목록
- `currentTopicId`: 현재 선택된 주제 ID
- `currentSectionIndex`: 현재 작성 중인 섹션 인덱스
- `currentScreen`: 현재 화면 ('list', 'detail', 'write')

### Storage
로컬 스토리지 관리
- `loadTopics()`: 저장된 주제 불러오기
- `saveTopics()`: 주제 목록 저장
- `saveTopic()`: 개별 주제 저장
- `deleteTopic()`: 주제 삭제

### Renderer
화면 렌더링
- `renderTopicList()`: 글감 목록 화면
- `renderDetailScreen()`: 상세 화면
- `renderWriteScreen()`: 작성 화면

### App
앱 컨트롤러
- `init()`: 앱 초기화
- `showList()`: 목록 화면 표시
- `showDetail()`: 상세 화면 표시
- `startWriting()`: 작성 시작
- `navigateSection()`: 섹션 이동
- `createTopic()`: 새 주제 생성

## 🎨 디자인 특징

- **카드 기반 UI** - 각 주제를 카드 형태로 표시
- **진행률 시각화** - 프로그레스 바로 진행 상황 표시
- **반응형 디자인** - 모바일부터 데스크톱까지 최적화
- **부드러운 애니메이션** - 페이드인, 슬라이드업 효과
- **직관적인 아이콘** - 이모지를 활용한 친근한 UI

## 💾 데이터 구조

```javascript
{
  id: "고유ID",
  title: "주제 제목",
  category: "카테고리",
  sections: [
    {
      title: "섹션 제목",
      content: "작성 내용",
      completed: true/false,
      guide: "작성 가이드"
    }
  ],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

## 🔧 커스터마이징

### 색상 변경
`styles.css`의 CSS 변수를 수정하여 테마 변경 가능:

```css
:root {
    --primary-color: #4F46E5;
    --secondary-color: #10B981;
    --danger-color: #EF4444;
    /* ... */
}
```

### 자동 저장 간격 변경
`app.js`의 디바운스 시간 수정:

```javascript
const debouncedSave = Utils.debounce((value) => {
    // ...
}, 1000); // 밀리초 단위
```

### 완료 기준 변경
섹션 완료 기준 글자 수 수정:

```javascript
currentSection.completed = value.trim().length > 50; // 50자 이상
```

## 📱 모바일 최적화

- 반응형 그리드 레이아웃
- 터치 친화적인 버튼 크기
- 스크롤 가능한 섹션 네비게이션
- 최대 너비 768px로 제한하여 가독성 향상

## 🌐 브라우저 지원

- Chrome (최신 버전)
- Firefox (최신 버전)
- Safari (최신 버전)
- Edge (최신 버전)
- 모바일 브라우저 (iOS Safari, Chrome for Android)

## 📄 라이센스

MIT License

## 👥 기여

이슈와 풀 리퀘스트는 언제나 환영합니다!

## 📞 문의

질문이나 제안사항이 있으시면 이슈를 등록해주세요.
