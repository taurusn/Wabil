# --- stage 1: build the web app (Expo web export -> app/dist) ---
FROM node:20-alpine AS webbuild
WORKDIR /app/app
COPY app/package*.json /app/app/
RUN npm install --no-audit --no-fund
COPY app/ /app/app/
RUN npm run build:web

# --- stage 2: the server, serving the built web assets ---
FROM node:20-alpine

# Pre-install the Gmail MCP so the execution agent's `npx -y @gongrzhe/...`
# resolves instantly and works without reaching the registry at call time.
RUN npm i -g @gongrzhe/server-gmail-autoauth-mcp@latest

WORKDIR /app/server

# Install deps first for layer caching. tsx is a devDependency and `npm start`
# runs the TypeScript directly, so install all deps (no --omit=dev).
COPY server/package*.json /app/server/
RUN npm install --no-audit --no-fund

# Server code, then the web build from stage 1. Server serves PWA_DIR=../app/dist.
COPY server/ /app/server/
COPY --from=webbuild /app/app/dist /app/app/dist

EXPOSE 8787
CMD ["npm", "start"]
