# Build stage
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

EXPOSE 4675
CMD ["npm", "start"]