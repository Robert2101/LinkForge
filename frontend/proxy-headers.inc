# Sent with every request nginx forwards to the backend.

proxy_http_version 1.1;
proxy_set_header Connection "";          # keep connections to the backend open and reuse them
proxy_set_header Host $http_host;
proxy_set_header X-Forwarded-Proto $scheme;

# The visitor's real address. It REPLACES whatever the client sent in this
# header, so nobody can fake their IP to dodge rate limits. The backend runs
# with TRUST_PROXY=1 to read it.
proxy_set_header X-Forwarded-For $remote_addr;

proxy_connect_timeout 5s;
proxy_read_timeout 30s;
