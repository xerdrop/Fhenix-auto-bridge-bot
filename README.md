
# Fhenix Auto Bridge Bot

Automated ETH bridging bot from Ethereum Sepolia testnet to Fhenix testnet.

## 🚀 What It Does

- Automatically bridges Sepolia ETH to Fhenix testnet using official bridge contracts
- Randomizes transaction amounts and timing
- Runs 24/7 with daily transaction quotas
- Optimizes gas fees for cost efficiency

## ⚙️ Quick Setup

```bash
# Clone repository
git clone https://github.com/xerdrop/Fhenix-auto-bridge-bot.git
cd Fhenix-auto-bridge-bot

# Install dependencies
npm install

# Create environment file
echo "PRIVATE_KEY=your_wallet_private_key" > .env

# Configure settings in config.json
# Start bridging
node main.js
```

## 📝 Configuration

Edit `config.json`:
- `MIN/MAX_TX_PER_DAY`: Daily transaction limits
- `MIN/MAX_AMOUNT_ETH`: Sepolia ETH amount range per transaction  
- `MIN/MAX_DELAY_SEC`: Delay between transactions
- `PROXY_ADDRESS`: Fhenix bridge contract address

## 🌉 How It Works

1. Deposits Sepolia ETH to Fhenix bridge proxy contract
2. Bridge validators process the transaction
3. ETH appears on Fhenix testnet (~10-15 minutes)
4. Repeats based on your daily quota settings

## 🧪 Testnet Requirements

- Sepolia ETH for bridging (get from faucets)
- Sepolia ETH for gas fees
- Compatible with Fhenix testnet only

## ⚠️ Important

- Keep private keys secure
- Test with small amounts first
- Ensure sufficient Sepolia ETH for gas fees
- Monitor bridge confirmations

**Use at your own risk. Educational purposes only.**
