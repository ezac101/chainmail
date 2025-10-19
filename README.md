# ChainMail

A decentralized, blockchain-based email system with end-to-end encryption using PGP and immutable storage on IPFS. Built on BlockDAG with smart contracts for permanent email record-keeping.

## Features

- **End-to-End Encryption**: All emails encrypted with OpenPGP before transmission
- **Blockchain Storage**: Email metadata stored immutably on-chain via smart contracts
- **IPFS Integration**: Encrypted email content stored on IPFS (decentralized storage)
- **Wallet Authentication**: MetaMask-based authentication and signing
- **Relay Service**: Gasless transactions via meta-transactions for better UX
- **Public Key Registry**: On-chain PGP public key registration for seamless encryption

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Blockchain**: Ethers.js v6, Solidity smart contracts
- **Encryption**: OpenPGP.js for PGP encryption
- **Storage**: IPFS (via HTTP API)
- **UI Components**: Radix UI, Lucide Icons

## Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- MetaMask or compatible Web3 wallet
- Access to a blockchain network (testnet/mainnet)
- IPFS node or gateway access

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/ezac101/chainmail.git
cd chainmail
npm install
```

### 2. Environment Setup

Create a `.env.local` file in the root directory:

```bash
# Blockchain Configuration
NEXT_PUBLIC_CHAINMAIL_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_RELAY_URL=http://localhost:3001

# IPFS Configuration (if using custom node)
NEXT_PUBLIC_IPFS_API_URL=http://localhost:5001
NEXT_PUBLIC_IPFS_GATEWAY_URL=http://localhost:8080

# Network Configuration
NEXT_PUBLIC_NETWORK_CHAIN_ID=1337
```

### 3. Deploy Smart Contract (if needed)

Deploy the `ChainMail.sol` contract to your blockchain network and update the contract address in `.env.local`.

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Connect Wallet

- Click "Connect Wallet" and approve MetaMask connection
- Register your PGP public key (auto-generated on first use)
- Start sending encrypted emails!

## Available Scripts

```bash
npm run dev      # Start development server with Turbopack
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Project Structure

```
src/
├── app/              # Next.js app router pages
├── components/       # React components
├── lib/              # Utility functions
├── services/         # Business logic services
│   ├── blockchain.service.ts   # Smart contract interactions
│   ├── email.service.ts        # Email handling
│   ├── encryption.service.ts   # PGP encryption
│   ├── ipfs.service.ts         # IPFS storage
│   ├── relay.service.ts        # Meta-transaction relay
│   └── wallet.service.ts       # Wallet management
contracts/
└── ChainMail.sol     # Solidity smart contract
```

## How It Works

1. **User Authentication**: Users connect via MetaMask, generating a PGP keypair stored locally
2. **Key Registration**: Public keys registered on-chain for recipient lookup
3. **Email Composition**: Emails encrypted with recipient's public key using OpenPGP
4. **IPFS Storage**: Encrypted email content uploaded to IPFS, returning a CID
5. **Blockchain Recording**: Email metadata (sender, recipient, IPFS CID) logged on-chain
6. **Email Retrieval**: Recipients fetch email IDs from contract, decrypt content from IPFS

## Security Notes

- Private keys never leave the user's browser
- All emails encrypted client-side before IPFS upload
- Smart contracts enforce immutability (emails cannot be deleted)
- Relay service only facilitates transactions, cannot read email content

## License

MIT
