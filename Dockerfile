# Frontend build stage
FROM node:22 AS frontend-stage

WORKDIR /netsocket/frontend-app
COPY frontend-app/package*.json ./
RUN npm ci
COPY frontend-app/ ./
RUN npm run build

# Server deps stage
FROM node:22 AS build-stage

ENV NODE_ENV=production
WORKDIR /netsocket

COPY package*.json ./
RUN npm install --omit=dev

# Runtime stage
FROM node:22 AS runtime-stage

ENV NODE_ENV=production
WORKDIR /netsocket

COPY --from=build-stage /netsocket/node_modules ./node_modules
COPY . .
COPY --from=frontend-stage /netsocket/frontend/dist ./frontend/dist

EXPOSE 4675
CMD ["npm", "start"]
