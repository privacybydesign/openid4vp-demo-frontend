FROM node:22-alpine

COPY . /app
WORKDIR /app

RUN npm install

EXPOSE 8080

CMD ["./entry-point.sh"]
