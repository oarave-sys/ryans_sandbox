# Multi-stage build: compile the client (React) and server (Node) separately,
# then assemble a small runtime image that serves both from one container.

# --- Stage 1: build the client SPA ---
FROM node:22-slim AS client
WORKDIR /client
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build            # outputs to /client/dist

# --- Stage 2: build the server ---
FROM node:22-slim AS server
WORKDIR /server
COPY server/package.json server/package-lock.json* ./
RUN npm install
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build            # outputs to /server/dist (+ schema.sql)
RUN npm prune --omit=dev     # keep only production dependencies

# --- Stage 3: runtime ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Server code + production node_modules
COPY --from=server /server/dist ./dist
COPY --from=server /server/node_modules ./node_modules
COPY --from=server /server/package.json ./package.json
# Built client, served as static files
COPY --from=client /client/dist ./client
ENV CLIENT_DIR=/app/client
ENV PORT=8080
EXPOSE 8080
# Run as the non-root user that the node image already provides.
USER node
CMD ["node", "dist/index.js"]
