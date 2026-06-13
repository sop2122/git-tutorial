#!/bin/bash
# Claude Code 모닝 스케줄 cron 등록 스크립트
# 실행: bash scripts/setup-cron.sh [레포경로]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MORNING_SCRIPT="$SCRIPT_DIR/morning-claude.sh"
REPO_PATH="${1:-$(dirname "$SCRIPT_DIR")}"

# 스크립트 실행 권한 부여
chmod +x "$MORNING_SCRIPT"

# 기존 claude 관련 cron 제거 후 새로 등록
CRON_JOB="0 8 * * * CLAUDE_REPO_PATH=\"$REPO_PATH\" bash \"$MORNING_SCRIPT\" >> \$HOME/.claude-schedule/cron.log 2>&1"

# 현재 crontab 가져오기 (없으면 빈 파일)
CURRENT_CRON=$(crontab -l 2>/dev/null | grep -v "morning-claude.sh" || true)

# 새 crontab 작성
echo "$CURRENT_CRON" | grep -v "^$" > /tmp/new_crontab || true
echo "" >> /tmp/new_crontab
echo "# Claude Code 모닝 세션 (매일 오전 8시, KST)" >> /tmp/new_crontab
echo "$CRON_JOB" >> /tmp/new_crontab

crontab /tmp/new_crontab
rm /tmp/new_crontab

echo "✓ Cron 등록 완료!"
echo ""
echo "등록된 스케줄:"
crontab -l | grep -A1 "Claude Code"
echo ""
echo "로그 위치: ~/.claude-schedule/"
echo ""
echo "수동 테스트: bash \"$MORNING_SCRIPT\""
echo "Cron 확인:   crontab -l"
echo "Cron 제거:   crontab -l | grep -v morning-claude | crontab -"
