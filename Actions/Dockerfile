FROM ubuntu:24.04

ARG RUNNER_VERSION=2.334.0
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl wget tar git ca-certificates gnupg unzip zip jq \
    build-essential python3 netcat-openbsd \
    libicu-dev libssl-dev libkrb5-3 zlib1g \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 -s /bin/bash runner

RUN groupadd -f docker && usermod -aG docker runner

WORKDIR /home/runner/actions-runner

RUN curl -fsSL -o runner.tar.gz \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
    && tar xzf runner.tar.gz \
    && rm runner.tar.gz \
    && ./bin/installdependencies.sh \
    && chown -R runner:runner /home/runner

COPY --chmod=755 entrypoint.sh /entrypoint.sh

USER runner

ENTRYPOINT ["/entrypoint.sh"]
