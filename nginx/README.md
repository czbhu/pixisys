# Nginx Configuration for PixiSys

## Domain Configuration

This directory contains Nginx reverse proxy configurations for the PixiSys applications:

- **te.pixisys.eu** → PixiERP (port 8000)
- **ti.pixisys.eu** → PixInvoice (port 4001)

## Setup

The configurations are automatically symlinked to Nginx:

```bash
/etc/nginx/sites-available/te.pixisys.eu.conf → /path/to/pixisys/nginx/te.pixisys.eu.conf
/etc/nginx/sites-available/ti.pixisys.eu.conf → /path/to/pixisys/nginx/ti.pixisys.eu.conf
```

## SSL Configuration (HTTPS)

To enable HTTPS with Let's Encrypt:

### 1. Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx
```

### 2. Obtain SSL Certificates

For PixiERP:
```bash
sudo certbot --nginx -d te.pixisys.eu -d www.te.pixisys.eu
```

For PixInvoice:
```bash
sudo certbot --nginx -d ti.pixisys.eu -d www.ti.pixisys.eu
```

### 3. Auto-renewal

Certbot automatically sets up auto-renewal. Test it with:
```bash
sudo certbot renew --dry-run
```

## Testing Configuration

```bash
# Test Nginx config syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx
```

## Logs

Access and error logs are located at:

- PixiERP: `/var/log/nginx/te.pixisys.eu-*.log`
- PixInvoice: `/var/log/nginx/ti.pixisys.eu-*.log`

## Port Configuration

Make sure the backend applications are running on the correct ports:

- **PixiERP**: http://127.0.0.1:8000
- **PixInvoice**: http://127.0.0.1:4001

## DNS Configuration

Ensure DNS A records point to your server IP:

```
te.pixisys.eu       A    <your-server-ip>
www.te.pixisys.eu   A    <your-server-ip>
ti.pixisys.eu       A    <your-server-ip>
www.ti.pixisys.eu   A    <your-server-ip>
```

## Troubleshooting

### Check if ports are in use:
```bash
sudo lsof -i :80
sudo lsof -i :443
sudo lsof -i :8000
sudo lsof -i :4001
```

### View Nginx status:
```bash
sudo systemctl status nginx
```

### View real-time logs:
```bash
# Access logs
sudo tail -f /var/log/nginx/te.pixisys.eu-access.log
sudo tail -f /var/log/nginx/ti.pixisys.eu-access.log

# Error logs
sudo tail -f /var/log/nginx/te.pixisys.eu-error.log
sudo tail -f /var/log/nginx/ti.pixisys.eu-error.log
```
