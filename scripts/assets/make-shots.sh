#!/usr/bin/env bash
# Generates the 10 demo-video motion shots on fal.ai (Kling 2.5 Turbo Pro text-to-video, 5 s, 16:9, no audio).
# Usage: scripts/assets/make-shots.sh [name ...]   (default: all jobs in scripts/assets/jobs/shots/)
set -euo pipefail
cd "$(dirname "$0")/../.."
MODEL=fal-ai/kling-video/v2.5-turbo/pro/text-to-video
names=("$@"); [ ${#names[@]} -eq 0 ] && names=($(ls scripts/assets/jobs/shots/*.json | xargs -n1 basename | sed 's/\.json$//'))
for n in "${names[@]}"; do
  out="assets-src/video/shots/$n.mp4"
  [ -f "$out" ] && [ -z "${FORCE:-}" ] && { echo "skip $n (exists)"; continue; }
  node scripts/assets/fal.mjs "shot-$n" "$MODEL" "scripts/assets/jobs/shots/$n.json" "$out" 0.35 "demo motion shot t2v 5s" || echo "FAILED $n"
done
