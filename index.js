const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Configuration
const config = {
  secret: process.env.GITHUB_WEBHOOK_SECRET || '',
  repositories: JSON.parse(process.env.REPOSITORIES || '[]'),
  dockerServices: JSON.parse(process.env.DOCKER_SERVICES || '[]'),
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Logging utility
const log = {
  info: (message) => {
    if (['info', 'debug'].includes(config.logLevel)) {
      console.log(`[INFO] ${new Date().toISOString()}: ${message}`);
    }
  },
  error: (message) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`);
  },
  debug: (message) => {
    if (config.logLevel === 'debug') {
      console.log(`[DEBUG] ${new Date().toISOString()}: ${message}`);
    }
  }
};

// Verify GitHub webhook signature
function verifySignature(payload, signature) {
  if (!config.secret) {
    log.debug('No webhook secret configured, skipping signature verification');
    return true;
  }

  const hmac = crypto.createHmac('sha256', config.secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

// Execute shell command with promise
function execAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// Pull repository
async function pullRepository(repoConfig) {
  const { name, path: repoPath, branch = 'main' } = repoConfig;
  
  try {
    log.info(`Pulling repository: ${name} at ${repoPath}`);
    
    // Check if directory exists
    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository path does not exist: ${repoPath}`);
    }

    // Navigate to repo and pull
    const pullCommand = `cd "${repoPath}" && git pull origin ${branch}`;
    const result = await execAsync(pullCommand);
    
    log.info(`Successfully pulled ${name}: ${result.stdout.trim()}`);
    return true;
  } catch (error) {
    log.error(`Failed to pull repository ${name}: ${error.message}`);
    if (error.stderr) {
      log.error(`Git error output: ${error.stderr}`);
    }
    return false;
  }
}

// Restart Docker services
async function restartDockerServices(services) {
  if (!services || services.length === 0) {
    log.debug('No Docker services configured for restart');
    return true;
  }

  try {
    for (const service of services) {
      log.info(`Restarting Docker service: ${service}`);
      
      const restartCommand = `docker restart ${service}`;
      const result = await execAsync(restartCommand);
      
      log.info(`Successfully restarted ${service}: ${result.stdout.trim()}`);
    }
    return true;
  } catch (error) {
    log.error(`Failed to restart Docker services: ${error.message}`);
    if (error.stderr) {
      log.error(`Docker error output: ${error.stderr}`);
    }
    return false;
  }
}

// Main webhook handler
async function handleWebhook(payload) {
  log.info('Processing webhook payload');
  
  const results = {
    repositories: [],
    services: [],
    success: true
  };

  // Pull repositories
  for (const repo of config.repositories) {
    const success = await pullRepository(repo);
    results.repositories.push({ name: repo.name, success });
    if (!success) results.success = false;
  }

  // Restart Docker services
  const servicesSuccess = await restartDockerServices(config.dockerServices);
  results.services.push({ success: servicesSuccess });
  if (!servicesSuccess) results.success = false;

  return results;
}

// Webhook endpoint
app.post('/hook/refresh', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);

  log.info('Received webhook request');
  log.debug(`Signature: ${signature}`);
  log.debug(`Payload preview: ${payload.substring(0, 200)}...`);

  // Verify signature if secret is configured
  if (signature && !verifySignature(payload, signature)) {
    log.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const results = await handleWebhook(req.body);
    
    const statusCode = results.success ? 200 : 500;
    log.info(`Webhook processing completed with status: ${statusCode}`);
    
    res.status(statusCode).json({
      message: results.success ? 'Webhook processed successfully' : 'Webhook processed with errors',
      results
    });
  } catch (error) {
    log.error(`Webhook processing failed: ${error.message}`);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    config: {
      repositories: config.repositories.length,
      dockerServices: config.dockerServices.length,
      hasSecret: !!config.secret
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'TFM-hook server is running',
    endpoints: {
      webhook: '/hook/refresh',
      health: '/health'
    }
  });
});

// Start server
app.listen(PORT, () => {
  log.info(`TFM-hook server started on port ${PORT}`);
  log.info(`Configured repositories: ${config.repositories.length}`);
  log.info(`Configured Docker services: ${config.dockerServices.length}`);
  log.info(`Webhook secret configured: ${!!config.secret}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});