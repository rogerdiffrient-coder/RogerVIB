#!/usr/bin/env bash
set -euo pipefail

MODE="${1:?mode required}"
EPOCH="${2:-0}"
TOTAL=10
REPORT_DIR="training/v04_reports"
STATUS="training/latest_v04_status.json"
mkdir -p "$REPORT_DIR"

now() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }

write_status() {
  local phase="$1"
  local detail="$2"
  cat > "$STATUS" <<EOF
{
  "phase": "$phase",
  "detail": "$detail",
  "epoch": $EPOCH,
  "total_epochs": $TOTAL,
  "run_id": "${GITHUB_RUN_ID:-unknown}",
  "run_attempt": "${GITHUB_RUN_ATTEMPT:-unknown}",
  "source_sha": "${GITHUB_SHA:-unknown}",
  "updated_at": "$(now)"
}
EOF
}

case "$MODE" in
  started)
    write_status "STARTED" "GitHub runner reached the first telemetry step for 10-epoch training"
    cp "$STATUS" "$REPORT_DIR/started-${GITHUB_RUN_ID:-unknown}.json"
    ;;
  epoch)
    RESULT="training/epoch-${EPOCH}-result.json"
    LOG="training/epoch-${EPOCH}.log"
    EXPORT="models/micro-v0.4-epoch-${EPOCH}"
    test -f "$RESULT"
    test -f "$LOG"
    test -f "$EXPORT/config.json"
    cp "$RESULT" "$REPORT_DIR/epoch-${EPOCH}.json"
    cp "$LOG" training/latest_v04_training_log.txt
    rm -rf models/micro-v0.4-preview
    cp -R "$EXPORT" models/micro-v0.4-preview
    write_status "EPOCH_COMPLETE" "Epoch ${EPOCH}/${TOTAL} finished; checkpoint uploaded and live preview refreshed"
    ;;
  failed)
    LOG="training/epoch-${EPOCH}.log"
    if [ -f "$LOG" ]; then cp "$LOG" training/latest_v04_training_log.txt; fi
    write_status "TRAINING_FAILED" "Epoch ${EPOCH}/${TOTAL} failed or timed out"
    cp "$STATUS" "$REPORT_DIR/epoch-${EPOCH}-failed.json"
    ;;
  quality)
    QUALITY="training/latest_v04_quality_report.txt"
    if [ -f "$QUALITY" ]; then cp "$QUALITY" "$REPORT_DIR/quality-${GITHUB_RUN_ID:-unknown}.txt"; fi
    write_status "QUALITY_COMPLETE" "Browser-like quality test completed after 10 epochs"
    ;;
  quality_failed)
    QUALITY="training/latest_v04_quality_report.txt"
    if [ -f "$QUALITY" ]; then cp "$QUALITY" "$REPORT_DIR/quality-${GITHUB_RUN_ID:-unknown}.txt"; fi
    write_status "QUALITY_FAILED" "10-epoch candidate was rejected by browser-like quality checks"
    ;;
  published)
    write_status "PUBLISHED" "Final 10-epoch v0.4 candidate passed validation and quality checks and was published"
    ;;
  *)
    echo "unknown telemetry mode: $MODE" >&2
    exit 2
    ;;
esac

git config user.name 'RogerVIB Trainer'
git config user.email 'actions@users.noreply.github.com'
git add -A "$REPORT_DIR" "$STATUS"
[ -f training/latest_v04_training_log.txt ] && git add training/latest_v04_training_log.txt || true
[ -f training/latest_v04_quality_report.txt ] && git add training/latest_v04_quality_report.txt || true
if [ "$MODE" = "epoch" ]; then git add -A models/micro-v0.4-preview; fi

if git diff --cached --quiet; then
  echo "telemetry unchanged"
  exit 0
fi

git commit -m "RogerVIB v0.4 telemetry: ${MODE} ${EPOCH}/${TOTAL} [skip ci]"
git pull --rebase --autostash origin main
git push origin HEAD:main
