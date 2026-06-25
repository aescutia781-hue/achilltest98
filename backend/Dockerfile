# ─── deps stage ────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ─── runtime stage ─────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Java + Allure CLI para la generación de reportes en el API
# (el procesamiento se hace en background pero corre en el mismo container)
RUN apk add --no-cache openjdk17-jre curl tar bash && \
    ALLURE_VERSION=2.30.0 && \
    curl -fsSL -o /tmp/allure.tgz \
      "https://github.com/allure-framework/allure2/releases/download/${ALLURE_VERSION}/allure-${ALLURE_VERSION}.tgz" && \
    tar -xzf /tmp/allure.tgz -C /opt/ && \
    ln -sf /opt/allure-${ALLURE_VERSION}/bin/allure /usr/local/bin/allure && \
    rm /tmp/allure.tgz && \
    allure --version

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV ALLURE_BIN=/usr/local/bin/allure
EXPOSE 3001

CMD ["node", "src/index.js"]
