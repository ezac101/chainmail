import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

const CHAINMAIL_ABI = [
  'function registerPublicKeyFor(address _user, string memory _publicKey) public',
];

export async function POST(request: NextRequest) {
  try {
    const { publicKey, userAddress } = await request.json();

    if (!publicKey || !userAddress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const relayPrivateKey = process.env.RELAY_WALLET_PRIVATE_KEY;
    
    if (!relayPrivateKey || relayPrivateKey === 'your_relay_wallet_private_key_here') {
      return NextResponse.json(
        { error: 'Relay wallet not configured' },
        { status: 500 }
      );
    }

    const rpcUrl = process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL;
    const contractAddress = process.env.NEXT_PUBLIC_CHAINMAIL_CONTRACT_ADDRESS;

    if (!rpcUrl || !contractAddress) {
      return NextResponse.json(
        { error: 'Blockchain configuration missing' },
        { status: 500 }
      );
    }

    console.log('💰 [Relay API] Registering public key for user:', userAddress);
    
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const relayWallet = new ethers.Wallet(relayPrivateKey, provider);
    
    // Check balance
    const balance = await provider.getBalance(relayWallet.address);
    console.log('💰 [Relay API] Relay balance:', ethers.formatEther(balance), 'BDAG');
    
    if (parseFloat(ethers.formatEther(balance)) < 0.001) {
      return NextResponse.json(
        { error: 'Relay wallet balance too low' },
        { status: 500 }
      );
    }

    // Create contract instance
    const contract = new ethers.Contract(contractAddress, CHAINMAIL_ABI, relayWallet);

    // Send transaction
    console.log('📤 [Relay API] Sending transaction...');
  const tx = await contract.registerPublicKeyFor(userAddress, publicKey);
    console.log('📤 [Relay API] Transaction hash:', tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log('✅ [Relay API] Confirmed in block:', receipt.blockNumber);

    return NextResponse.json({
      success: true,
      transactionHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (error) {
    console.error('❌ [Relay API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
