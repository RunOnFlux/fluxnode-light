module.exports = {
  server: {
    port: 4444,
  },
  explorers: {
    FLUX: 'https://explorer.runonflux.io/address/',
    TRON: 'https://tronscan.org/#/address/',
    ETH: 'https://etherscan.io/address/',
    BSC: 'https://bscscan.com/address/',
    SOL: 'https://solscan.io/account/',
  },
  fetchDelay: 5100, // in case of missing api key
  bscApiKey: '',
  ethApiKey: '',
  discordHook: '',
  addresses: [
    {
      coin: 'FLUX', label: 'SNAPSHOT', address: 't1UwmAPJ1kv1qy6hV93nL5d5pQezBL55TgN', ALERT: 0,
    },
    {
      coin: 'FLUX', label: 'MINING', address: 't1Yum7okNzR5kW84dfgwqB23yy1BCcpHFPq', ALERT: 0,
    },
    {
      coin: 'FLUX', label: 'SWAP', address: 't1abAp9oZenibGLFuZKyUjmL6FiATTaCYaj', ALERT: 1,
    },
    {
      coin: 'FLUX', label: 'COLD', address: 't1cjcLaDHkNcuXh6uoyNL7u1jx7GxvzfYAN', ALERT: 0,
    },
    {
      coin: 'SOL', label: 'SNAPSHOT', address: '94W7UnJTBNEQSAk854NLTBgbqzSqHQNyFtQYPiGzNFaA', ALERT: 0.001,
    },
    {
      coin: 'SOL', label: 'MINING', address: '9dfk2Rq1MnuvjQvTsBkWvncpvQsuR8vrioFzkFG7HKvW', ALERT: 0.001,
    },
    {
      coin: 'SOL', label: 'SWAP', address: 'CCafnH2sUhPHitQWyFLDCe3Xqwz1Vrc2caNR6PAwkPzP', ALERT: 0.001,
    },
    {
      coin: 'SOL', label: 'COLD', address: '98duys57BNeYNdA4JPYzkraXe1XoUYXq5MMesx1JLsFY', ALERT: 0.001,
    },
    {
      coin: 'BSC', label: 'SNAPSHOT', address: '0x4004755e538b77f80004b0f9b7f7df4e9793e584', ALERT: 0.01,
    },
    {
      coin: 'BSC', label: 'MINING', address: '0x8cb191750096ddc8f314c2de6ef28331503774e9', ALERT: 0.01,
    },
    {
      coin: 'BSC', label: 'SWAP', address: '0x9b192227da99b5a50d037b10c965609ed83c43d7', ALERT: 0.01,
    },
    {
      coin: 'BSC', label: 'COLD', address: '0x5b79692e093c70e47070f525b593cc35b5adf530', ALERT: 0,
    },
    {
      coin: 'ETH', label: 'SNAPSHOT', address: '0x5a2387883bc5e875e09d533eef812b2da30f2615', ALERT: 0.1,
    },
    {
      coin: 'ETH', label: 'MINING', address: '0x342c34702929849b6deaa47496d211cbe4167fa5', ALERT: 0.1,
    },
    {
      coin: 'ETH', label: 'SWAP', address: '0x134e4c74c670adefdcb2476df6960d9297bc7dad', ALERT: 0.1,
    },
    {
      coin: 'ETH', label: 'COLD', address: '0xa23702e9349fbf9939864da1245f5b358e7ef30b', ALERT: 0,
    },
    {
      coin: 'TRON', label: 'SNAPSHOT', address: 'TSHXNnsrKGf6KAfosq5mckCnaY7gUfGwBJ', ALERT: 100,
    },
    {
      coin: 'TRON', label: 'MINING', address: 'TVkT9g2zzgcztm81RozqBA1UbwzZpoN8cM', ALERT: 100,
    },
    {
      coin: 'TRON', label: 'SWAP', address: 'TA7U2PTnHDyhHBns3X6NsDndjZDBUE3oUa', ALERT: 100,
    },
    {
      coin: 'TRON', label: 'COLD', address: 'THV8NGvAwyaL22kkhkXHVhL7JBDyxRs3BZ', ALERT: 0,
    },
  ],
};
