FROM alpine:3.11@sha256:3983cc12fb9dc20a009340149e382a18de6a8261b0ac0e8f5fcdf11f8dd5937e AS builder

RUN apk add --no-cache nodejs-current=12.4.0-r0 nodejs-npm=10.16.3-r0
RUN npm install -g yarn@1.17.3

COPY package.json tsconfig.json yarn.lock /lsif/
COPY src /lsif/src

RUN yarn --cwd /lsif
RUN yarn --cwd /lsif run build

FROM alpine:3.11@sha256:3983cc12fb9dc20a009340149e382a18de6a8261b0ac0e8f5fcdf11f8dd5937e

ARG COMMIT_SHA="unknown"
ARG DATE="unknown"
ARG VERSION="unknown"

LABEL org.opencontainers.image.revision=${COMMIT_SHA}
LABEL org.opencontainers.image.created=${DATE}
LABEL org.opencontainers.image.version=${VERSION}
LABEL com.sourcegraph.github.url=https://github.com/sourcegraph/sourcegraph/commit/${COMMIT_SHA}

# set default
ENV PGDATABASE=sg PGHOST=pgsql PGPORT=5432 PGSSLMODE=disable PGUSER=sg

# hadolint ignore=DL3018
RUN apk add --no-cache tini supervisor=3.3.5-r0 nodejs-current=12.4.0-r0

COPY --from=builder /lsif /lsif
COPY supervisord.conf /supervisord.conf
COPY kill_supervisor.sh /kill_supervisor.sh

EXPOSE 3186 3187
CMD ["/sbin/tini", "--", "/usr/bin/supervisord", "-c", "/supervisord.conf"]
