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
# The same image runs both processes; the host picks the command per service.
CMD ["npx", "tsx", "src/index.ts"]
