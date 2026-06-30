#!/usr/bin/env bash
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"

# Resolve node WITHOUT scanning all of /nix/store - that walk spikes IO on the linuxkit VM and can
# itself trigger a devcontainer reconnect. Prefer the devbox-provided symlink, then PATH, and only
# fall back to a store scan as a last resort.
NODE="$REPO/.devbox/nix/profile/default/bin/node"
[ -x "$NODE" ] || NODE=$(command -v node 2>/dev/null || true)
[ -z "$NODE" ] && NODE=$(find /nix/store -name "node" -type f 2>/dev/null | grep -v ".drv" | head -1)
[ -z "$NODE" ] && { echo "Error: node not found."; exit 1; }

echo ""
echo "  Mezzanine"
echo "  ──────────────────────────────────"

kill $(lsof -ti:3001 2>/dev/null) 2>/dev/null || true
sleep 1

# Build frontend only if dist is missing (skip rebuild on container restart).
# Throttled build (see scripts/safe-build.sh) so the all-core esbuild spike can't
# starve the VS Code heartbeat and trigger a devcontainer reconnect.
cd "$REPO/client"
if [ ! -d "dist" ]; then
  bash "$REPO/scripts/safe-build.sh" 2>&1 | tail -4
else
  echo "  Frontend already built (dist/ exists), skipping rebuild"
fi

# Start backend — nohup detaches from the shell session so VS Code
# devcontainer reconnects don't SIGHUP-kill the process.
# Point the server at the devbox-provided kubectl/helm (the container image instead
# bundles them on PATH). Set MEZZ_DEMO=1 here if you want the mock cluster locally.
export MEZZ_KUBECTL="$REPO/.devbox/nix/profile/default/bin/kubectl"
export MEZZ_HELM="$REPO/.devbox/nix/profile/default/bin/helm"

# AWS: the default credential chain reads AWS_PROFILE from this exported env (mounted ~/.aws).
# Region follows the profile unless AWS_REGION is set explicitly. Just surface what's active -
# export AWS_PROFILE=<name> in your shell before running this to switch accounts.
if [ -n "$AWS_PROFILE" ] || [ -n "$AWS_REGION" ] || [ -n "$MEZZ_AWS" ] || [ -n "$AWS_ACCESS_KEY_ID" ]; then
  echo "  AWS: profile=${AWS_PROFILE:-<default chain>} region=${AWS_REGION:-<from profile>}"
fi
echo "  Starting server → http://localhost:3001"
cd "$REPO"
nohup $NODE src/server.js >> /tmp/k8s-backend.log 2>&1 &
PID=$!

for i in $(seq 1 20); do
  curl -sf http://localhost:3001/api/health > /dev/null 2>&1 && break
  sleep 0.5
done

echo ""
echo "  ✓  http://localhost:3001  (everything on one port)"
echo "  PID $PID  ·  Log: /tmp/k8s-backend.log"
echo ""
