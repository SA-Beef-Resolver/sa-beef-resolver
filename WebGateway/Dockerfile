# Build context is the repository root so the proto and the frontend can be copied in.
FROM node:22-bookworm-slim AS frontend
WORKDIR /frontend
COPY Frontend/package*.json ./
RUN npm ci
COPY Frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY WebGateway/package*.json ./
RUN npm ci --omit=dev
COPY WebGateway/src/ ./src/
COPY EvidenceAndArgumentSubmission/proto/ ./proto/
COPY --from=frontend /frontend/dist/ ./public/
ENV PORT=8081
EXPOSE 8081
USER node
CMD ["node", "src/server.js"]
