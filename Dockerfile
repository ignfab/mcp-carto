FROM node:24.22.1-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24.22.1-alpine AS production

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/node_modules node_modules/
# Remove package-manager tooling from the runtime image.
# This keeps the runtime surface smaller and avoids Trivy findings
# coming from npm's bundled dependencies rather than the app itself.
RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /opt/yarn-v* \
  && rm -f \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg

EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]
