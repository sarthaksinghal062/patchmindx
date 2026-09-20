#!/bin/bash
set -eo pipefail

# Ensure non-root execution
if [ "$(id -u)" -eq 0 ]; then
    echo "ERROR: Sandbox container must not run as root user." >&2
    exit 126
fi

# Ensure workspace exists
export WORKSPACE="${WORKSPACE:-/workspace}"
cd "$WORKSPACE"

# Sanitized python execution environment
export PYTHONDONTWRITEBYTECODE=1
export PYTHONUNBUFFERED=1
export PYTHONPATH="${WORKSPACE}/project:${WORKSPACE}:${PYTHONPATH}"

# Trap signals for clean termination
cleanup() {
    EXIT_CODE=$?
    # Clean temporary runtime files inside workspace
    rm -rf /tmp/pm_* /workspace/.cache /workspace/.pytest_cache 2>/dev/null || true
    exit $EXIT_CODE
}
trap cleanup EXIT INT TERM

# If no arguments provided, print usage
if [ $# -eq 0 ]; then
    echo "Usage: entrypoint.sh python3 run_tests.py --project /workspace/project --command pytest --timeout 120"
    exit 1
fi

# If command is python or python3 calling runner, execute with arguments
if [[ "$1" == "python" || "$1" == "python3" || "$1" == "run_tests.py" ]]; then
    exec "$@"
fi

# Otherwise execute arbitrary test command safely
exec "$@"
