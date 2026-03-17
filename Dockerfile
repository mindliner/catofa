# syntax=docker/dockerfile:1.7

ARG CATOFA_DIR=catofa
ARG LAKESIDE_DIR=lakeside

############################
# Stage 1 – build Catofa UI
############################
FROM node:22-bookworm AS ui-builder
ARG CATOFA_DIR
WORKDIR /app

# Install dependencies first for better layer caching
COPY ${CATOFA_DIR}/package.json ./
COPY ${CATOFA_DIR}/package-lock.json ./
RUN npm ci

# Copy the rest of the Catofa sources
COPY ${CATOFA_DIR}/ ./
RUN npm run build

##############################################
# Stage 2 – build the Lakeside Rust binary
##############################################
FROM rust:1.85-bookworm AS lakeside-builder
ARG LAKESIDE_DIR
WORKDIR /src/lakeside

COPY ${LAKESIDE_DIR}/Cargo.toml ./
COPY ${LAKESIDE_DIR}/Cargo.lock ./
COPY ${LAKESIDE_DIR}/src ./src

RUN cargo build --locked --release

##############################################
# Stage 3 – runtime image with Node + Lakeside
##############################################
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    CATOFA_DATA_DIR=/var/lib/catofa \
    CATOFA_TICKETS=/var/lib/catofa/tickets.json \
    CATOFA_WALLET=/home/node/.lakeside \
    LAKESIDE_BIN=/usr/local/bin/lakeside \
    LAKESIDE_CWD=/opt/lakeside

RUN apt-get update \
 && apt-get install -y --no-install-recommends tini curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=ui-builder /app/package.json ./
COPY --from=ui-builder /app/package-lock.json ./
COPY --from=ui-builder /app/node_modules ./node_modules
COPY --from=ui-builder /app/server ./server
COPY --from=ui-builder /app/public ./public
COPY --from=ui-builder /app/vite.config.ts ./vite.config.ts
COPY --from=ui-builder /app/tsconfig*.json ./
COPY --from=ui-builder /app/dist ./dist

COPY --from=lakeside-builder /src/lakeside/target/release/lakeside /usr/local/bin/lakeside
COPY --from=lakeside-builder /src/lakeside/Cargo.toml /opt/lakeside/Cargo.toml

RUN mkdir -p /var/lib/catofa /home/node/.lakeside \
 && chown -R node:node /app /var/lib/catofa /home/node/.lakeside /opt/lakeside \
 && chmod +x /usr/local/bin/lakeside

USER node
EXPOSE 4077
VOLUME ["/var/lib/catofa", "/home/node/.lakeside"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "start"]
