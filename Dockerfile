# Chore Quest is a static site (HTML + ES modules), so a tiny nginx image serves it.
# Cloud Run tells the container which port to listen on via $PORT (default 8080).
FROM nginx:1.27-alpine

ENV PORT=8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY index.html styles.css /usr/share/nginx/html/
COPY src /usr/share/nginx/html/src

EXPOSE 8080
