FROM node:26-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
RUN npm ci --workspace packages/server --omit=dev --ignore-scripts

FROM node:26-slim
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json ./
COPY packages/server ./packages/server
WORKDIR /repo/packages/server
EXPOSE 8787
# The same image runs both processes; the host picks which by setting VANGO_PROCESS
# to src/watcher/index.ts on the watcher service. Unset, it runs the API.
CMD ["sh", "-c", "npx tsx ${VANGO_PROCESS:-src/index.ts}"]
