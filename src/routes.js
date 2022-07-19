const balanceService = require('./services/balanceService');

const prefix = 'api';

module.exports = (app) => {
  app.get(`/${prefix}/test`, (req, res) => {
    balanceService.getTest(req, res);
  });
  app.get(`/${prefix}/data`, (req, res) => {
    balanceService.getData(req, res);
  });
};
