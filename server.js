const http = require('http');
const config = require('config');
const app = require('./src/lib/server');
const log = require('./src/lib/log');

const balanceService = require('./src/services/balanceService');

const server = http.createServer(app);
const port = process.env.PORT || config.server.port;

balanceService.fetchBalances();
setInterval(() => {
  balanceService.fetchBalances();
}, 5 * 60 * 1000);

setInterval(() => {
  balanceService.checkHooks();
}, 6 * 60 * 1000);

server.listen(port, () => {
  log.info(`App listening on port ${port}!`);
});
