FROM node:26-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12.0.0
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod --ignore-scripts

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/whos-gaff.db UPLOADS_PATH=/data/uploads BODY_SIZE_LIMIT=10M
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY scripts ./scripts
VOLUME /data
EXPOSE 3000
CMD ["node", "build"]
