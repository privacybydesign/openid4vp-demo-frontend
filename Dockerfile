FROM node:22-alpine

# Cache-buster for the two upgrade layers below. Both resolve "whatever upstream
# publishes today", so a layer restored from the GitHub Actions cache keeps
# shipping the versions that were current when that layer was first built. That
# is how the weekly security rebuild kept producing libssl3/libcrypto3 3.5.7-r0
# weeks after Alpine had 3.5.8-r0 (CVE-2026-75803, CVE-2026-63073), failing the
# Grype gate. The Delivery workflow passes a per-run value so CI re-resolves
# upstream on every build; local builds keep the default and stay cached.
# The value has to be referenced by a RUN to have any effect: BuildKit misses
# the cache on a build arg's first use, not on its declaration.
ARG SECURITY_UPGRADE_BUST=local

RUN echo "security upgrade: ${SECURITY_UPGRADE_BUST}" \
    && apk update \
    && apk upgrade --no-cache

# Upgrade the npm CLI bundled in the base image: node:22-alpine ships npm 10.9.8,
# whose transitive deps (tar, sigstore, picomatch, brace-expansion, ...) trip the
# Grype scan. Upgrading clears the critical tar advisory and most of the rest.
RUN npm install -g npm@latest

COPY . /app
WORKDIR /app

RUN npm install

EXPOSE 8080

CMD ["./entry-point.sh"]
