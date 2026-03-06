# Start Inactive Nodes Script

This script automatically starts all inactive FluxNodes for a given collateral address, provided you have the private keys configured in your `.env` file.

## Usage

### Using npm:
```bash
npm run start:inactive -- <collateral-address>
```

### Using node directly:
```bash
node scripts/start-inactive-nodes.js <collateral-address>
```

## Examples

Start all inactive nodes for a specific collateral address:
```bash
npm run start:inactive -- t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ
```

List available addresses (run without arguments):
```bash
npm run start:inactive
```

## How It Works

1. **Validates Address Configuration**: Checks that the provided collateral address exists in your `.env` file with all required keys:
   - `ADDRESS_N_COLLATERAL_ADDRESS`
   - `ADDRESS_N_FLUXNODE_PRIVATE_KEY`
   - `ADDRESS_N_P2SH_PRIVATE_KEY`
   - `ADDRESS_N_REDEEM_SCRIPT`

2. **Fetches Collateral UTXOs**: Queries the Flux Explorer API to find all FluxNode collateral outputs (12500 or 40000 FLUX) for your address

3. **Fetches Confirmed Node List**: Queries the Flux network to get the deterministic zelnode list (all confirmed/registered FluxNodes)

4. **Compares and Identifies Nodes to Start**: For each collateral UTXO:
   - Checks if it exists in the confirmed node list
   - **If found in confirmed list**: Node is already active - SKIP IT (do not attempt to start)
   - **If NOT in confirmed list**: Node needs to be started - attempt to start it

5. **Starts Nodes Not in Confirmed List**: For any collateral not in the confirmed list, uses the existing `fluxnodeService` to generate and broadcast the start transaction

6. **Provides Summary**: Shows a detailed report of:
   - Total collaterals found
   - Already confirmed (skipped)
   - Not in confirmed list (attempted to start)
   - Successfully started
   - Failed starts (with error messages)

## Output

The script provides detailed logging:
- Progress for each node (txid:index)
- Node status (ACTIVE, INACTIVE, NOT REGISTERED)
- Start transaction results
- Final summary with statistics

All output is also logged to the application log files in `./logs/`

## Rate Limiting

The script includes a 2-second delay between start requests to avoid API rate limiting.

## Prerequisites

- Node.js installed
- `.env` file configured with your address credentials
- FluxNode collateral (12500 or 40000 FLUX) funded to the address

## Troubleshooting

### "Address not found in .env configuration"
Add your address to `.env` following this pattern:
```bash
ADDRESS_3_NAME=My_Node_Name
ADDRESS_3_COLLATERAL_ADDRESS=t3YourAddressHere
ADDRESS_3_FLUXNODE_PRIVATE_KEY=YourFluxNodePrivateKey
ADDRESS_3_P2SH_PRIVATE_KEY=YourP2SHPrivateKey
ADDRESS_3_REDEEM_SCRIPT=YourRedeemScript
```

### "No FluxNode collaterals found"
Ensure your address has valid FluxNode collateral (exactly 12500 or 40000 FLUX in a single UTXO)

### Start failures
Check the error messages in the output. Common issues:
- Node already started recently (wait for cooldown period)
- Invalid private keys
- Network connectivity issues
- API rate limiting (the script handles this with delays)

## Notes

- The script will NOT start already active nodes
- Transactions are logged for audit purposes
- Discord notifications are sent if configured
- The script exits with code 0 on success, 1 on failure
