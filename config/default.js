module.exports = {
  server: {
    port: 9001,
  },
  discordHook: '',

  // Multi-address configuration
  // Each address can have its own credentials for starting fluxnodes
  addresses: [
    {
      name: 'name', // Friendly name for this address
      collateralAddress: '',
      fluxnodePrivateKey: '',
      p2shprivkey: '',
      redeemScript: '',
    },
    // Add more addresses here as needed:
    // {
    //   name: 'secondary',
    //   collateralAddress: 'YOUR_ADDRESS_HERE',
    //   fluxnodePrivateKey: 'YOUR_FLUXNODE_PRIVATE_KEY_HERE',
    //   p2shprivkey: 'YOUR_P2SH_PRIVATE_KEY_HERE',
    //   redeemScript: 'YOUR_REDEEM_SCRIPT_HERE',
    // },
  ],
};
