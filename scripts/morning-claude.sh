#!/bin/bash
# 매일 오전 8시에 실행되어 Claude Code 5시간 토큰 윈도우를 시작하는 스크립트
# 오전 8시 시작 → 오후 1시 리셋

set -euo pipefail

LOG_DIR="$HOME/.claude-schedule"
LOG_FILE="$LOG_DIR/session-$(date +%Y-%m-%d).log"
REPO_PATH="${CLAUDE_REPO_PATH:-$HOME}"  # 환경변수로 레포 경로 지정 가능

mkdir -p "$LOG_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Claude Code 모닝 세션 시작" | tee -a "$LOG_FILE"

# Claude Code가 설치되어 있는지 확인
if ! command -v claude &>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: claude 명령어를 찾을 수 없습니다. 설치를 확인하세요." | tee -a "$LOG_FILE"
    exit 1
fi

# 지정된 레포 경로로 이동
if [ -d "$REPO_PATH" ]; then
    cd "$REPO_PATH"
fi

# 토큰 윈도우 시작용 경량 작업 실행 (-p: print mode, 비대화형)
claude -p "오늘 날짜와 현재 git 상태를 간단히 확인해줘. 한 줄로 요약해줘." \
    --output-format text \
    2>&1 | tee -a "$LOG_FILE"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 세션 시작 완료. 오후 1시에 토큰이 리셋됩니다." | tee -a "$LOG_FILE"
