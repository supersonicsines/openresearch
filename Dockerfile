# Builds the site for one address: docker build --build-arg ORIGIN=https://example.org -t openresearch .
# SQLite and the repositories are kept in /data, which must be a persistent volume.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .

ARG ORIGIN
RUN test -n "$ORIGIN" && ORIGIN="$ORIGIN" node scripts/build.mjs && npm prune --omit=dev --ignore-scripts

ENV NODE_ENV=production
ENV ORIGIN=$ORIGIN
ENV DATA_DIR=/data
ENV HOST=0.0.0.0
ENV PORT=3000
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start.mjs"]
