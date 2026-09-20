# Minimal secure Python sandbox runner for PatchMind verification
FROM python:3.11-slim

# Prevent python from writing pyc and buffer stdout
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Install only minimal dependencies (pytest and patch utility)
RUN apt-get update && \
    apt-get install -y --no-install-recommends patch && \
    rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir pytest

# Create unprivileged sandbox user (UID 10001)
RUN useradd -u 10001 -m -s /bin/bash sandboxuser

# Setup isolated workspace
RUN mkdir -p /workspace && chown -R sandboxuser:sandboxuser /workspace

# Switch to non-root user
USER sandboxuser
WORKDIR /workspace

# Copy runner modules
COPY --chown=sandboxuser:sandboxuser entrypoint.sh /workspace/entrypoint.sh
COPY --chown=sandboxuser:sandboxuser run_tests.py /workspace/run_tests.py
COPY --chown=sandboxuser:sandboxuser apply_patch.py /workspace/apply_patch.py
COPY --chown=sandboxuser:sandboxuser collect_results.py /workspace/collect_results.py
COPY --chown=sandboxuser:sandboxuser cleanup.py /workspace/cleanup.py
COPY --chown=sandboxuser:sandboxuser supported_runtimes/ /workspace/supported_runtimes/

RUN chmod +x /workspace/entrypoint.sh

# Safe non-root entrypoint
ENTRYPOINT ["/bin/bash", "/workspace/entrypoint.sh"]
CMD ["--help"]
