## HTTPS / TLS Setup Guide

### Option A: Let's Encrypt with Certbot (Recommended for production)

1. **Install certbot** on the Docker host:
   ```bash
   sudo apt install certbot
   ```

2. **Obtain certificate:**
   ```bash
   sudo certbot certonly --standalone -d stage.orionconnect.io
   ```

3. **Mount certs into nginx container** — add to docker-compose.yml nginx service:
   ```yaml
   volumes:
     - ./nginx.conf:/etc/nginx/nginx.conf
     - /etc/letsencrypt:/etc/letsencrypt:ro
   ```

4. **Update nginx.conf** — replace the `server` block with:
   ```nginx
   # Redirect HTTP → HTTPS
   server {
       listen 80;
       server_name stage.orionconnect.io;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name stage.orionconnect.io;

       ssl_certificate     /etc/letsencrypt/live/stage.orionconnect.io/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/stage.orionconnect.io/privkey.pem;

       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_prefer_server_ciphers on;
       ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
       ssl_session_cache shared:SSL:10m;
       ssl_session_timeout 10m;

       # Add security headers
       add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
       add_header X-Content-Type-Options nosniff;
       add_header X-Frame-Options DENY;

       # ... (keep all location blocks unchanged) ...
   }
   ```

5. **Expose port 443** — update docker-compose.yml nginx service:
   ```yaml
   ports:
     - "80:80"
     - "443:443"
   ```

6. **Auto-renew** — add a cron job on the host:
   ```bash
   0 3 * * * certbot renew --quiet && docker restart nora-nginx-1
   ```

### Option B: Cloudflare Proxy (Zero-config TLS)

If your domain uses Cloudflare:
1. Set SSL mode to **Full (Strict)** in Cloudflare dashboard
2. Create an Origin Certificate in Cloudflare → mount into nginx
3. Cloudflare handles public-facing TLS termination

### Option C: Traefik (Docker-native)

Replace nginx with Traefik for automatic Let's Encrypt:
```yaml
traefik:
  image: traefik:v3
  command:
    - --entrypoints.web.address=:80
    - --entrypoints.websecure.address=:443
    - --certificatesresolvers.le.acme.tlschallenge=true
    - --certificatesresolvers.le.acme.email=admin@orionconnect.io
    - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./letsencrypt:/letsencrypt
    - /var/run/docker.sock:/var/run/docker.sock:ro
```
Then add labels to each service for automatic routing and TLS.
