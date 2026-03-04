FROM node:20.17-alpine3.20
WORKDIR /app
COPY local-proxy.js .
EXPOSE 9876
CMD ["node", "local-proxy.js"]
