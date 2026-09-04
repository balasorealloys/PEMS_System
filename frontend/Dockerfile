# PEMS frontend — serves the committed, prebuilt frontend/dist via nginx.
# Matches project convention (see DEPLOYMENT.md): dist ships in the repo, no
# Node/npm build needed on the server. Rebuild + commit dist after UI changes
# (`cd frontend && npm run build`) before rebuilding this image.
FROM nginx:1.27-alpine

COPY frontend/dist/ /usr/share/nginx/html/
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 4007

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:4007/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
