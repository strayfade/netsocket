FROM node:22
WORKDIR /netsocket
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 4675
CMD ["npm", "start"]