FROM node:22-alpine

RUN apk update && apk upgrade --no-cache

COPY . /app
WORKDIR /app

RUN npm install

EXPOSE 8080

CMD ["./entry-point.sh"]
