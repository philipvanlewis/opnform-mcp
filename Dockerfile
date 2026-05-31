# syntax=docker/dockerfile:1

# ---- build stage ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime stage --------------------------------------------------------
FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.title="opnform-mcp" \
      org.opencontainers.image.description="MCP server for OpnForm (Streamable HTTP)" \
      org.opencontainers.image.source="https://github.com/philipvanlewis/opnform-mcp" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 8080
# Containers default to remote HTTP mode.
CMD ["node", "dist/cli.js", "--http"]
