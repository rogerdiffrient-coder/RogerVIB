#!/usr/bin/env bash
set -euo pipefail
MODE="${1:?mode required}"
EPOCH="${2:-0}"
TOTAL=25
REPORT_DIR="training/v05_reports"
STATUS="training/latest_v05_status.json"
mkdir -p "$REPORT_DIR"
now() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
write_status() {
  local phase="$1"; local detail="$2"
  cat > "$STATUS" <<EOF
{
  "name": "Damn Daniel",
  "version": "0.5",
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
    write_status "STARTED" "RogerVIB v0.5 Damn Daniel runner reached first telemetry step"
    cp "$STATUS" "$REPORT_DIR/started-${GITHUB_RUN_ID:-unknown}.json" ;;
  epoch)
    RESULT="training/v05-epoch-${EPOCH}-result.json"
    LOG="training/v05-epoch-${EPOCH}.log"
    EXPORT="models/micro-v0.5-epoch-${EPOCH}"
    test -f "$RESULT"; test -f "$LOG"; test -f "$EXPORT/config.json"
    cp "$RESULT" "$REPORT_DIR/epoch-${EPOCH}.json"
    cp "$LOG" training/latest_v05_training_log.txt
    rm -rf models/micro-v0.5-preview
    cp -R "$EXPORT" models/micro-v0.5-preview
    write_status "EPOCH_COMPLETE" "Damn Daniel epoch ${EPOCH}/${TOTAL} finished; checkpoint uploaded and preview refreshed" ;;
  failed)
    LOG="training/v05-epoch-${EPOCH}.log"
    [ -f "$LOG" ] && cp "$LOG" training/latest_v05_training_log.txt || true
    write_status "TRAINING_FAILED" "Damn Daniel epoch ${EPOCH}/${TOTAL} failed or timed out"
    cp "$STATUS" "$REPORT_DIR/epoch-${EPOCH}-failed.json" ;;
  quality)
    QUALITY="training/latest_v05_quality_report.txt"
    [ -f "$QUALITY" ] && cp "$QUALITY" "$REPORT_DIR/quality-${GITHUB_RUN_ID:-unknown}.txt" || true
    write_status "QUALITY_COMPLETE" "Damn Daniel browser-like quality test completed" ;;
  quality_failed)
    QUALITY="training/latest_v05_quality_report.txt"
    [ -f "$QUALITY" ] && cp "$QUALITY" "$REPORT_DIR/quality-${GITHUB_RUN_ID:-unknown}.txt" || true
    write_status "QUALITY_FAILED" "Damn Daniel was rejected by browser-like quality checks" ;;
  published)
    write_status "PUBLISHED" "RogerVIB v0.5 Damn Daniel passed validation and quality checks and was published" ;;
  *) echo "unknown telemetry mode: $MODE" >&2; exit 2 ;;
esac

git config user.name 'RogerVIB Trainer'
git config user.email 'actions@users.noreply.github.com'
git add -A "$REPORT_DIR" "$STATUS"
[ -f training/latest_v05_training_log.txt ] && git add training/latest_v05_training_log.txt || true
[ -f training/latest_v05_quality_report.txt ] && git add training/latest_v05_quality_report.txt || true
if [ "$MODE" = "epoch" ]; then git add -A models/micro-v0.5-preview; fi
if git diff --cached --quiet; then echo "telemetry unchanged"; exit 0; fi
git commit -m "RogerVIB v0.5 Damn Daniel telemetry: ${MODE} ${EPOCH}/${TOTAL} [skip ci]"
git pull --rebase --autostash origin main
git push origin HEAD:main
