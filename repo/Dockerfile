FROM node:24-bookworm-slim

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm install

COPY . .

ENV PATH="/workspace/node_modules/.bin:${PATH}"
