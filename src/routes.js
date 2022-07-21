const fluxnodeService = require('./services/fluxnodeService');

const prefix = 'api';

module.exports = (app) => {
  app.get(`/${prefix}/start/:txid/:index`, (req, res) => {
    const { txid } = req.params;
    const { index } = req.params;
    fluxnodeService.getStart(txid, index, res);
  });
};
