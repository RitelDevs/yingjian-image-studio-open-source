# Dedicated login bridge; no changes to the existing Sub2API application.
location = /studio-sso/silent {
    proxy_pass http://127.0.0.1:8793/api/sso/silent;
    proxy_set_header X-Studio-Bridge-Origin https://$host;
    proxy_set_header Cookie "";
    proxy_set_header Authorization "";
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    access_log off;
}
location = /studio-sso/silent.js {
    proxy_pass http://127.0.0.1:8793/api/sso/silent.js;
    proxy_set_header X-Studio-Bridge-Origin https://$host;
    proxy_set_header Cookie "";
    proxy_set_header Authorization "";
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    access_log off;
}
location = /studio-sso/ {
    proxy_pass http://127.0.0.1:8793/api/sso/bridge;
    proxy_set_header X-Studio-Bridge-Origin https://$host;
    proxy_set_header Cookie "";
    proxy_set_header Authorization "";
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    access_log off;
}
location = /studio-sso/bridge.js {
    proxy_pass http://127.0.0.1:8793/api/sso/bridge.js;
    proxy_set_header X-Studio-Bridge-Origin https://$host;
    proxy_set_header Cookie "";
    proxy_set_header Authorization "";
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    access_log off;
}
location = /studio-sso/exchange {
    client_max_body_size 24k;
    proxy_pass http://127.0.0.1:8793/api/sso/exchange;
    proxy_set_header Origin $http_origin;
    proxy_set_header Cookie "";
    proxy_set_header Authorization "";
    proxy_read_timeout 25s;
    access_log off;
}
