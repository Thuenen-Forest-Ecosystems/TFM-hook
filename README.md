# TFM-hook

A GitHub webhook handler for automated repository pulling and Docker service management.

## Features

- **GitHub Webhook Integration**: Receives webhooks at `/hook/refresh` endpoint
- **Repository Management**: Automatically pulls configured repositories when webhooks are received
- **Docker Service Management**: Restarts specified Docker services after repository updates
- **Security**: Supports GitHub webhook signature verification
- **Logging**: Configurable logging levels (info, debug, error)
- **Health Monitoring**: Health check endpoint for monitoring

## Quick Start

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd TFM-hook
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run the Application**
   ```bash
   npm start
   ```

## Configuration

The application is configured using environment variables. Copy `.env.example` to `.env` and adjust the settings:

### Environment Variables

- `PORT`: Server port (default: 3000)
- `LOG_LEVEL`: Logging level - `info`, `debug`, or `error` (default: info)
- `GITHUB_WEBHOOK_SECRET`: GitHub webhook secret for signature verification (optional but recommended)
- `REPOSITORIES`: JSON array of repositories to manage
- `DOCKER_SERVICES`: JSON array of Docker services to restart

### Repository Configuration

The `REPOSITORIES` environment variable should contain a JSON array with repository configurations:

```json
[
  {
    "name": "my-app",
    "path": "/path/to/my-app",
    "branch": "main"
  },
  {
    "name": "my-service",
    "path": "/path/to/my-service",
    "branch": "develop"
  }
]
```

### Docker Services Configuration

The `DOCKER_SERVICES` environment variable should contain a JSON array of Docker service names:

```json
["web-service", "api-service", "database"]
```

## API Endpoints

### `POST /hook/refresh`
Main webhook endpoint that:
1. Verifies GitHub webhook signature (if configured)
2. Pulls all configured repositories
3. Restarts all configured Docker services

**Request Headers:**
- `x-hub-signature-256`: GitHub webhook signature (required if `GITHUB_WEBHOOK_SECRET` is set)

**Response:**
```json
{
  "message": "Webhook processed successfully",
  "results": {
    "repositories": [
      {"name": "my-app", "success": true}
    ],
    "services": [
      {"success": true}
    ],
    "success": true
  }
}
```

### `GET /health`
Health check endpoint that returns server status and configuration summary.

### `GET /`
Root endpoint that provides basic information about the service.

## GitHub Webhook Setup

1. Go to your GitHub repository settings
2. Navigate to "Webhooks"
3. Click "Add webhook"
4. Set Payload URL to: `https://ci.thuenen.de/hook/refresh`
5. Set Content type to: `application/json`
6. Set Secret to match your `GITHUB_WEBHOOK_SECRET`
7. Select events you want to trigger the webhook (usually "Just the push event")

## Security Considerations

- **Always set a webhook secret** (`GITHUB_WEBHOOK_SECRET`) to verify that requests are coming from GitHub
- **Run with appropriate permissions** - the application needs access to git repositories and Docker
- **Use HTTPS in production** to encrypt webhook payloads
- **Limit repository paths** to only directories the application should manage

## Deployment

### Using PM2 (Process Manager)
```bash
npm install -g pm2
pm2 start index.js --name tfm-hook
pm2 save
pm2 startup
```

### Using Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Using systemd
Create `/etc/systemd/system/tfm-hook.service`:
```ini
[Unit]
Description=TFM Webhook Handler
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/path/to/TFM-hook
ExecStart=/usr/bin/node index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### Common Issues

1. **Permission denied when pulling repositories**
   - Ensure the application has read/write access to repository directories
   - Check git credentials and SSH keys

2. **Docker restart failures**
   - Verify Docker is running and accessible
   - Check if the application user has Docker permissions
   - Ensure service names are correct

3. **Webhook signature verification fails**
   - Verify `GITHUB_WEBHOOK_SECRET` matches GitHub webhook configuration
   - Check that the secret is properly URL-encoded if necessary

### Logs

The application provides detailed logging. Set `LOG_LEVEL=debug` for verbose output:

```bash
LOG_LEVEL=debug npm start
```

## License

GPL-3.0