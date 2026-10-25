# Debian slim : sqlite3 s'installe avec ses binaires précompilés (Alpine demanderait une compilation)
FROM docker.io/library/node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# La base SQLite vit dans un volume monté sur /app/db
RUN mkdir -p db && chown node:node db
VOLUME /app/db

USER node

CMD ["node", "index.js"]
