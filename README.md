# Fluxnode Light

A lightweight, high-performance service for managing Flux Titan node operations with multi-address support, comprehensive monitoring, and enterprise-grade security features.

## Overview

Fluxnode Light is a specialized service designed to facilitate the starting of Flux nodes (particularly Titan nodes) by generating and broadcasting start transactions. It provides a robust REST API with built-in security, rate limiting, health monitoring, and multi-address configuration support.

## Features

- **Multi-Address Support**: Configure and manage multiple Flux node addresses from a single service
- **Enterprise Security**: API key authentication, rate limiting, IP whitelisting, and comprehensive security headers
- **Health Monitoring**: Built-in health checks, liveness/readiness probes, and metrics endpoints
- **Resilient Architecture**: Circuit breakers, retry logic, and graceful shutdown handling
- **Discord Integration**: Real-time notifications for transaction broadcasts
- **Comprehensive Logging**: Structured logging with rotation, audit trails, and performance metrics
- **Caching Layer**: Intelligent caching for external API responses to improve performance
- **Production Ready**: Helmet security, CORS support, compression, and production-optimized configuration

## Requirements

- Node.js 14.x or higher
- npm or yarn package manager
- Access to Flux blockchain explorer API
- Flux node collateral wallet configuration

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/fluxnode-light.git
cd fluxnode-light
```

2. Install dependencies:
```bash
npm install
```

3. Copy the example environment file:
```bash
cp .env.example .env
```

4. Configure your environment variables (see Configuration section)

5. Generate API keys (optional but recommended for production):
```bash
npm run generate:apikey
```

## Configuration

### Environment Variables

The service is configured through environment variables. Copy `.env.example` to `.env` and update the following:

#### Server Configuration
```bash
PORT=9001                    # Server port
NODE_ENV=production          # Environment (development/production)
```

#### API Authentication
```bash
API_KEY_REQUIRED=true        # Enable API key authentication
API_KEY_MAIN=your_key_here   # Main application API key
API_KEY_MOBILE=your_key_here # Mobile app API key
WHITELISTED_IPS=127.0.0.1    # Comma-separated IPs that bypass auth
```

#### Multi-Address Configuration

Configure one or more Flux node addresses:

```bash
# Address 1
ADDRESS_1_NAME=Primary_Titan
ADDRESS_1_COLLATERAL_ADDRESS=your_collateral_address
ADDRESS_1_FLUXNODE_PRIVATE_KEY=your_fluxnode_private_key
ADDRESS_1_P2SH_PRIVATE_KEY=your_p2sh_private_key
ADDRESS_1_REDEEM_SCRIPT=your_redeem_script

# Address 2 (optional)
ADDRESS_2_NAME=Secondary_Titan
ADDRESS_2_COLLATERAL_ADDRESS=another_collateral_address
# ... continue pattern for additional addresses
```

#### External Services
```bash
EXPLORER_API_URL=https://explorer.runonflux.io/api
FLUX_API_URL=https://api.runonflux.io
DISCORD_WEBHOOK_URL=your_webhook_url  # Optional Discord notifications
```

#### Rate Limiting
```bash
RATE_LIMIT_WINDOW_MS=900000           # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100           # Max requests per window
TRANSACTION_RATE_LIMIT_WINDOW_MS=300000  # 5 minutes
TRANSACTION_RATE_LIMIT_MAX_REQUESTS=10   # Max transaction requests
```

## Usage

### Starting the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

Using the start script:
```bash
./start-server.sh
```

### API Endpoints

#### Start Fluxnode (Legacy)
```
GET /api/start/:txid/:index
```
Starts a Fluxnode using the first configured address (backward compatibility).

**Parameters:**
- `txid`: Transaction ID of the collateral
- `index`: Output index of the collateral

**Headers (if API key required):**
```
Authorization: Bearer YOUR_API_KEY
```

#### Start Fluxnode with Specific Address
```
GET /api/start/:txid/:index/:addressName
```
Starts a Fluxnode using a specific configured address.

**Parameters:**
- `txid`: Transaction ID of the collateral
- `index`: Output index of the collateral
- `addressName`: Name of the configured address to use

#### List Configured Addresses
```
GET /api/addresses
```
Returns a list of all configured addresses (public information only).

**Response:**
```json
{
  "success": true,
  "addresses": [
    {
      "name": "Primary_Titan",
      "collateralAddress": "t1..."
    }
  ],
  "count": 1
}
```

#### Health Check Endpoints
```
GET /health              # Basic health check
GET /health/liveness     # Kubernetes liveness probe
GET /health/readiness    # Kubernetes readiness probe
GET /metrics            # Application metrics
```

### Example API Call

```bash
# Using curl with API key
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:9001/api/start/abc123def456/0

# Start with specific address
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:9001/api/start/abc123def456/0/Primary_Titan

# List available addresses
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:9001/api/addresses
```

## Scripts

```bash
npm start              # Start the server
npm run dev            # Start with nodemon (auto-restart on changes)
npm test              # Run tests
npm run health        # Check health endpoint
npm run metrics       # View metrics
npm run logs:clean    # Clean old log files
npm run generate:apikey  # Generate a new API key
```

## Security Features

- **API Key Authentication**: Multiple API keys with client identification
- **IP Whitelisting**: Bypass authentication for trusted IPs
- **Rate Limiting**: Configurable limits for general and transaction endpoints
- **Request Size Limiting**: Prevent large payload attacks
- **Helmet.js**: Security headers and protections
- **CORS Configuration**: Control cross-origin access
- **Audit Logging**: Track all transaction broadcasts
- **Circuit Breakers**: Protect against cascading failures

## Monitoring

The service provides comprehensive monitoring capabilities:

- **Health Checks**: Regular internal health monitoring
- **Liveness/Readiness Probes**: Kubernetes-compatible health endpoints
- **Metrics Endpoint**: Application metrics including request counts, error rates, and uptime
- **Structured Logging**: Winston-based logging with rotation
- **Performance Metrics**: Track request duration and success rates
- **Discord Notifications**: Real-time alerts for transaction events

## Logging

Logs are written to the `./logs` directory with automatic rotation:

- `app-YYYY-MM-DD.log`: Application logs
- `error-YYYY-MM-DD.log`: Error logs only
- `audit-YYYY-MM-DD.log`: Audit trail for transactions

Log levels: error, warn, info, debug

## Error Handling

The service includes comprehensive error handling:

- Circuit breakers for external API calls
- Retry logic with exponential backoff
- Graceful error responses
- Detailed error logging
- Discord error notifications

## Development

### Project Structure
```
fluxnode-light/
├── config/              # Configuration files
│   └── env-config.js    # Environment configuration parser
├── discord/             # Discord integration
│   └── hooks.js         # Webhook notifications
├── scripts/             # Utility scripts
│   └── generate-api-key.js
├── src/
│   ├── lib/            # Core libraries
│   │   ├── api-client.js    # HTTP client with retry logic
│   │   ├── logger.js        # Winston logger setup
│   │   ├── server.js        # Express server setup
│   │   └── shutdown-manager.js
│   ├── middleware/     # Express middleware
│   │   ├── auth.js          # API key authentication
│   │   ├── security.js      # Security middleware
│   │   └── validation.js    # Request validation
│   ├── routes/         # API routes
│   │   └── health.js        # Health check endpoints
│   └── services/       # Business logic
│       └── fluxnodeService.js  # Main service logic
├── .env.example        # Example environment configuration
├── package.json        # Project dependencies
├── server.js          # Application entry point
└── start-server.sh    # Startup script
```

### Testing

Run the test suite:
```bash
npm test
```

The project uses Mocha and Chai for testing with Supertest for API testing.

## Deployment

### Docker

Build the Docker image:
```bash
docker build -t fluxnode-light .
```

Run the container:
```bash
docker run -d -p 9001:9001 --env-file .env fluxnode-light
```

### Kubernetes

The service includes health check endpoints compatible with Kubernetes:

```yaml
livenessProbe:
  httpGet:
    path: /health/liveness
    port: 9001
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/readiness
    port: 9001
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Production Considerations

1. **API Keys**: Always use API key authentication in production
2. **HTTPS**: Deploy behind a reverse proxy (nginx/Apache) with SSL
3. **Rate Limiting**: Adjust rate limits based on expected traffic
4. **Monitoring**: Set up external monitoring for the health endpoints
5. **Backups**: Regularly backup your configuration and private keys
6. **Updates**: Keep dependencies updated for security patches

## Troubleshooting

### Common Issues

**Service won't start:**
- Check that all required environment variables are set
- Verify port 9001 is not already in use
- Ensure log directory exists and is writable

**Transaction broadcast fails:**
- Verify your private keys and redeem script are correct
- Check that the collateral address matches configuration
- Ensure external APIs are accessible
- Review logs for detailed error messages

**API authentication errors:**
- Verify API key is correctly set in Authorization header
- Check if your IP needs to be whitelisted
- Ensure API_KEY_REQUIRED is set appropriately

## Support

For issues, questions, or contributions, please:
1. Check the logs in `./logs` directory for detailed error information
2. Review the configuration in your `.env` file
3. Ensure all external services (Explorer API, Flux API) are accessible
4. Open an issue with detailed error messages and configuration (excluding sensitive data)

## License

ISC License - See LICENSE file for details

## Author

Jeremy Anderson

## Acknowledgments

- Flux Team for the blockchain infrastructure
- RunOnFlux SDK for transaction generation utilities