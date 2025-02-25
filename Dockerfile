FROM node:14

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

RUN npm install -g ts-node

COPY . .

EXPOSE 1883

CMD ["npm","run","start-broker", "start-clientUplink"]