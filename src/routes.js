const fluxnodeService = require('./services/fluxnodeService');

const prefix = 'api';

module.exports = (app) => {
  // Legacy endpoint - uses default/first address
  app.get(`/${prefix}/start/:txid/:index`, (req, res) => {
    const { txid } = req.params;
    const { index } = req.params;
    fluxnodeService.getStart(txid, index, req, res);
  });

  // New endpoint - specify which address to use by name
  app.get(`/${prefix}/start/:txid/:index/:addressName`, (req, res) => {
    const { txid } = req.params;
    const { index } = req.params;
    const { addressName } = req.params;
    fluxnodeService.getStart(txid, index, req, res, addressName);
  });

  // Endpoint to list all available addresses
  app.get(`/${prefix}/addresses`, (req, res) => {
    fluxnodeService.getAddresses(req, res);
  });
};
