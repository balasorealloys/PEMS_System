# PEMS frontend — serves the committed, prebuilt frontend/dist via nginx.
# Matches project convention (see DEPLOYMENT.md): dist ships in the repo, no
# Node/npm build needed on the server. Rebuild + commit dist after UI changes
# (`cd frontend && npm run build`) before rebuilding this image.
FROM nginx:1.27-alpine

COPY frontend/dist/ /usr/share/nginx/html/
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 4040

# Use 127.0.0.1, NOT localhost: in this image `localhost` resolves to ::1 (IPv6) first,
# but nginx only listens on IPv4 (listen 4040;), so a localhost probe gets connection-
# refused and the container was falsely marked unhealthy though the site served fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:4040/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
