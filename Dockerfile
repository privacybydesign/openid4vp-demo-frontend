FROM node:22-alpine

RUN apk update && apk upgrade --no-cache

# Upgrade the npm CLI bundled in the base image: node:22-alpine ships npm 10.9.8,
# whose transitive deps (tar, sigstore, picomatch, brace-expansion, ...) trip the
# Grype scan. Upgrading clears the critical tar advisory and most of the rest.
RUN npm install -g npm@latest

COPY . /app
WORKDIR /app

RUN npm install

EXPOSE 8080

CMD ["./entry-point.sh"]
