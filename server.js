const http = require('http');
const config = require('config');
const app = require('./src/lib/server');
const log = require('./src/lib/log');

const server = http.createServer(app);
const port = process.env.PORT || config.server.port;

server.listen(port, () => {
  log.info(`App listening on port ${port}!`);
});
