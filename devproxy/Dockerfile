FROM denoland/deno:latest

WORKDIR /devproxy
COPY . .

EXPOSE 8888

CMD [ "deno", "run", "-RN", "main.ts" ]
