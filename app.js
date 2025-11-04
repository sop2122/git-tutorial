// 전역 상태 관리
const AppState = {
    topics: [],
    currentTopicId: null,
    currentSectionIndex: 0,
    currentScreen: 'list' // 'list', 'detail', 'write'
};

// 로컬 스토리지 관리
const Storage = {
    TOPICS_KEY: 'writing-topics',

    loadTopics() {
        const data = localStorage.getItem(this.TOPICS_KEY);
        return data ? JSON.parse(data) : [];
    },

    saveTopics(topics) {
        localStorage.setItem(this.TOPICS_KEY, JSON.stringify(topics));
    },

    saveTopic(topic) {
        const topics = this.loadTopics();
        const index = topics.findIndex(t => t.id === topic.id);
        if (index >= 0) {
            topics[index] = topic;
        } else {
            topics.push(topic);
        }
        this.saveTopics(topics);
    },

    deleteTopic(topicId) {
        const topics = this.loadTopics().filter(t => t.id !== topicId);
        this.saveTopics(topics);
    }
};

// 유틸리티 함수
const Utils = {
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    calculateProgress(sections) {
        if (!sections || sections.length === 0) return 0;
        const completed = sections.filter(s => s.completed).length;
        return Math.round((completed / sections.length) * 100);
    },

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return '오늘';
        if (days === 1) return '어제';
        if (days < 7) return `${days}일 전`;
        return date.toLocaleDateString('ko-KR');
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// 화면 렌더링 함수들
const Renderer = {
    render(screen) {
        const app = document.getElementById('app');
        app.innerHTML = '';
        app.className = 'fade-in';

        switch (screen) {
            case 'list':
                app.appendChild(this.renderTopicList());
                break;
            case 'detail':
                app.appendChild(this.renderDetailScreen());
                break;
            case 'write':
                app.appendChild(this.renderWriteScreen());
                break;
        }
    },

    renderTopicList() {
        const container = document.createElement('div');
        container.className = 'topic-list-screen';

        // 헤더
        const header = document.createElement('div');
        header.className = 'header';
        header.innerHTML = `
            <h1 class="header-title">📝 글쓰기 도우미</h1>
        `;

        // 새 주제 추가 버튼
        const addBtn = document.createElement('button');
        addBtn.className = 'add-topic-btn';
        addBtn.innerHTML = '✨ 새 글감 추가하기';
        addBtn.onclick = () => this.showAddTopicModal();

        container.appendChild(addBtn);

        // 주제 카드들
        const topics = Storage.loadTopics();

        if (topics.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state slide-up';
            emptyState.innerHTML = `
                <div class="empty-state-icon">📚</div>
                <div class="empty-state-text">아직 저장된 글감이 없어요</div>
                <div class="empty-state-subtext">새로운 글감을 추가해서 글쓰기를 시작해보세요!</div>
            `;
            container.appendChild(emptyState);
        } else {
            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'topic-cards';

            topics.forEach(topic => {
                const card = this.renderTopicCard(topic);
                cardsContainer.appendChild(card);
            });

            container.appendChild(cardsContainer);
        }

        const wrapper = document.createElement('div');
        wrapper.appendChild(header);
        wrapper.appendChild(container);

        return wrapper;
    },

    renderTopicCard(topic) {
        const card = document.createElement('div');
        card.className = 'topic-card slide-up';

        const progress = Utils.calculateProgress(topic.sections);
        const outlinePreview = topic.sections.slice(0, 3).map(s => s.title).join(' · ');

        card.innerHTML = `
            <div class="topic-card-header">
                <h3 class="topic-title">${topic.title}</h3>
                <button class="delete-btn" onclick="event.stopPropagation(); App.deleteTopic('${topic.id}')">🗑️</button>
            </div>
            <div class="topic-category">${topic.category}</div>
            <div class="topic-outline-preview">${outlinePreview}</div>
            <div class="progress-section">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
                <span class="progress-text">${progress}%</span>
            </div>
        `;

        card.onclick = (e) => {
            if (!e.target.classList.contains('delete-btn')) {
                App.showDetail(topic.id);
            }
        };

        return card;
    },

    renderDetailScreen() {
        const topic = Storage.loadTopics().find(t => t.id === AppState.currentTopicId);
        if (!topic) {
            App.showList();
            return document.createElement('div');
        }

        const container = document.createElement('div');
        container.className = 'detail-screen';

        const progress = Utils.calculateProgress(topic.sections);
        const completed = topic.sections.filter(s => s.completed).length;

        container.innerHTML = `
            <div class="header">
                <button class="back-btn" onclick="App.showList()">←</button>
                <h1 class="header-title">주제 상세</h1>
                <div style="width: 24px;"></div>
            </div>
            <div class="detail-content">
                <div class="topic-info">
                    <h2 class="topic-info-title">${topic.title}</h2>
                    <div class="topic-info-category">${topic.category}</div>
                    <div class="progress-info">
                        <div class="progress-info-label">진행률</div>
                        <div class="progress-section">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress}%"></div>
                            </div>
                            <span class="progress-text">${completed}/${topic.sections.length}</span>
                        </div>
                    </div>
                </div>
                <div class="outline-section">
                    <h3 class="outline-section-title">📋 목차</h3>
                    <div class="outline-list">
                        ${topic.sections.map((section, index) => `
                            <div class="outline-item ${section.completed ? 'completed' : ''}">
                                <div class="outline-checkbox">${section.completed ? '✓' : ''}</div>
                                <div class="outline-text">${index + 1}. ${section.title}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="detail-actions">
                <button class="start-btn" onclick="App.startWriting()">
                    ${progress > 0 ? '계속 작성하기 →' : '탐구 시작하기 🚀'}
                </button>
            </div>
        `;

        return container;
    },

    renderWriteScreen() {
        const topic = Storage.loadTopics().find(t => t.id === AppState.currentTopicId);
        if (!topic) {
            App.showList();
            return document.createElement('div');
        }

        const currentSection = topic.sections[AppState.currentSectionIndex];
        const progress = Utils.calculateProgress(topic.sections);

        const container = document.createElement('div');
        container.className = 'write-screen';

        // 헤더
        const header = document.createElement('div');
        header.className = 'header';
        header.innerHTML = `
            <button class="back-btn" onclick="App.showDetail('${topic.id}')">←</button>
            <h1 class="header-title">${topic.title}</h1>
            <div style="width: 24px;"></div>
        `;

        // 진행률 표시
        const progressBar = document.createElement('div');
        progressBar.className = 'write-progress';
        progressBar.innerHTML = `
            <div class="write-progress-label">
                <span>섹션 ${AppState.currentSectionIndex + 1}/${topic.sections.length}</span>
                <span>${progress}% 완료</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
        `;

        // 작성 영역
        const content = document.createElement('div');
        content.className = 'write-content';

        const sectionTitle = document.createElement('h2');
        sectionTitle.className = 'section-title';
        sectionTitle.textContent = currentSection.title;

        const guide = document.createElement('div');
        guide.className = 'section-guide';
        guide.textContent = currentSection.guide || '자유롭게 생각을 작성해보세요. 자동으로 저장됩니다.';

        const textarea = document.createElement('textarea');
        textarea.className = 'write-textarea';
        textarea.placeholder = '여기에 작성하세요...';
        textarea.value = currentSection.content || '';

        // 자동 저장
        const autoSaveIndicator = document.createElement('div');
        autoSaveIndicator.className = 'auto-save-indicator';
        autoSaveIndicator.textContent = '자동 저장됨';

        const debouncedSave = Utils.debounce((value) => {
            currentSection.content = value;
            currentSection.completed = value.trim().length > 50; // 50자 이상 작성시 완료로 간주
            Storage.saveTopic(topic);
            autoSaveIndicator.textContent = '저장됨 ✓';

            // 진행률 업데이트
            const newProgress = Utils.calculateProgress(topic.sections);
            document.querySelector('.progress-fill').style.width = `${newProgress}%`;
            document.querySelector('.write-progress-label span:last-child').textContent = `${newProgress}% 완료`;
        }, 1000);

        textarea.oninput = (e) => {
            autoSaveIndicator.textContent = '저장 중...';
            debouncedSave(e.target.value);
        };

        content.appendChild(sectionTitle);
        content.appendChild(guide);
        content.appendChild(textarea);
        content.appendChild(autoSaveIndicator);

        // 네비게이션
        const navigation = document.createElement('div');
        navigation.className = 'write-navigation';

        const navButtons = document.createElement('div');
        navButtons.className = 'nav-buttons';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'nav-btn';
        prevBtn.textContent = '← 이전';
        prevBtn.disabled = AppState.currentSectionIndex === 0;
        prevBtn.onclick = () => App.navigateSection(-1);

        const nextBtn = document.createElement('button');
        nextBtn.className = AppState.currentSectionIndex === topic.sections.length - 1 ? 'nav-btn primary' : 'nav-btn';
        nextBtn.textContent = AppState.currentSectionIndex === topic.sections.length - 1 ? '완료 ✓' : '다음 →';
        nextBtn.onclick = () => {
            if (AppState.currentSectionIndex === topic.sections.length - 1) {
                App.showDetail(topic.id);
            } else {
                App.navigateSection(1);
            }
        };

        navButtons.appendChild(prevBtn);
        navButtons.appendChild(nextBtn);

        // 빠른 네비게이션
        const quickNav = document.createElement('div');
        quickNav.className = 'section-quick-nav';

        topic.sections.forEach((section, index) => {
            const navItem = document.createElement('button');
            navItem.className = 'quick-nav-item';
            if (index === AppState.currentSectionIndex) {
                navItem.classList.add('active');
            }
            if (section.completed) {
                navItem.classList.add('completed');
            }
            navItem.textContent = `${index + 1}. ${section.title}`;
            navItem.onclick = () => App.jumpToSection(index);
            quickNav.appendChild(navItem);
        });

        navigation.appendChild(navButtons);
        navigation.appendChild(quickNav);

        container.appendChild(header);
        container.appendChild(progressBar);
        container.appendChild(content);
        container.appendChild(navigation);

        return container;
    },

    showAddTopicModal() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay fade-in';
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        };

        const modal = document.createElement('div');
        modal.className = 'modal slide-up';

        modal.innerHTML = `
            <h2 class="modal-title">새 글감 추가</h2>
            <div class="form-group">
                <label class="form-label">주제</label>
                <input type="text" class="form-input" id="topic-title" placeholder="예: 인공지능의 윤리적 문제">
            </div>
            <div class="form-group">
                <label class="form-label">카테고리</label>
                <select class="form-select" id="topic-category">
                    <option value="자유 주제">자유 주제</option>
                    <option value="과학">과학</option>
                    <option value="기술">기술</option>
                    <option value="사회">사회</option>
                    <option value="문화">문화</option>
                    <option value="철학">철학</option>
                    <option value="역사">역사</option>
                    <option value="기타">기타</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">목차 (각 섹션)</label>
                <div id="outline-inputs" class="outline-inputs">
                    <input type="text" class="form-input" placeholder="1. 서론">
                    <input type="text" class="form-input" placeholder="2. 본론">
                    <input type="text" class="form-input" placeholder="3. 결론">
                </div>
                <button class="add-outline-btn" onclick="App.addOutlineInput()">+ 섹션 추가</button>
            </div>
            <div class="modal-actions">
                <button class="modal-btn cancel" onclick="App.closeModal()">취소</button>
                <button class="modal-btn confirm" onclick="App.createTopic()">추가하기</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }
};

// 앱 컨트롤러
const App = {
    init() {
        AppState.topics = Storage.loadTopics();
        this.showList();
    },

    showList() {
        AppState.currentScreen = 'list';
        AppState.currentTopicId = null;
        Renderer.render('list');
    },

    showDetail(topicId) {
        AppState.currentTopicId = topicId;
        AppState.currentScreen = 'detail';
        Renderer.render('detail');
    },

    startWriting() {
        const topic = Storage.loadTopics().find(t => t.id === AppState.currentTopicId);
        if (!topic) return;

        // 첫 미완료 섹션 찾기
        const firstIncomplete = topic.sections.findIndex(s => !s.completed);
        AppState.currentSectionIndex = firstIncomplete >= 0 ? firstIncomplete : 0;
        AppState.currentScreen = 'write';
        Renderer.render('write');
    },

    navigateSection(direction) {
        AppState.currentSectionIndex += direction;
        Renderer.render('write');
    },

    jumpToSection(index) {
        AppState.currentSectionIndex = index;
        Renderer.render('write');
    },

    deleteTopic(topicId) {
        if (confirm('정말 이 글감을 삭제하시겠습니까?')) {
            Storage.deleteTopic(topicId);
            this.showList();
        }
    },

    addOutlineInput() {
        const container = document.getElementById('outline-inputs');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-input';
        input.placeholder = `${container.children.length + 1}. 섹션 제목`;
        container.appendChild(input);
    },

    createTopic() {
        const title = document.getElementById('topic-title').value.trim();
        const category = document.getElementById('topic-category').value;
        const outlineInputs = document.getElementById('outline-inputs').querySelectorAll('.form-input');

        if (!title) {
            alert('주제를 입력해주세요.');
            return;
        }

        const sections = Array.from(outlineInputs)
            .map(input => input.value.trim())
            .filter(value => value)
            .map(title => ({
                title,
                content: '',
                completed: false,
                guide: this.getGuideForSection(title)
            }));

        if (sections.length === 0) {
            alert('최소 1개의 섹션을 추가해주세요.');
            return;
        }

        const topic = {
            id: Utils.generateId(),
            title,
            category,
            sections,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        Storage.saveTopic(topic);
        this.closeModal();
        this.showList();
    },

    getGuideForSection(title) {
        const lower = title.toLowerCase();
        if (lower.includes('서론') || lower.includes('도입')) {
            return '💡 주제를 소개하고 왜 이 주제가 중요한지 설명해보세요.';
        } else if (lower.includes('본론') || lower.includes('분석')) {
            return '🔍 주제에 대한 깊이 있는 분석과 다양한 관점을 제시해보세요.';
        } else if (lower.includes('결론') || lower.includes('마무리')) {
            return '✨ 지금까지의 내용을 요약하고 자신의 견해를 밝혀보세요.';
        }
        return '✏️ 이 섹션의 내용을 자유롭게 작성해보세요.';
    },

    closeModal() {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) {
            document.body.removeChild(overlay);
        }
    }
};

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
