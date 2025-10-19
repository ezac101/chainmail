import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

const CHAINMAIL_ABI = [
  'function logSendFor(address _sender, address _recipient, string memory _ipfsHash) public returns (uint256)',
];

export async function POST(request: NextRequest) {
  try {
    const { recipientAddress, ipfsHash, userAddress } = await request.json();

    if (!recipientAddress || !ipfsHash || !userAddress) {
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

    console.log('💰 [Relay API] Processing transaction for user:', userAddress);
    
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const relayWallet = new ethers.Wallet(relayPrivateKey, provider);
    
    console.log('💰 [Relay API] Relay wallet:', relayWallet.address);
    
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
  const tx = await contract.logSendFor(userAddress, recipientAddress, ipfsHash);
    console.log('📤 [Relay API] Transaction hash:', tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log('✅ [Relay API] Confirmed in block:', receipt.blockNumber);

    // Extract emailId from events
    const emailSentEvent = receipt.logs.find(
      (log: ethers.Log | ethers.EventLog) => {
        if ('topics' in log && log.topics && log.topics.length > 0) {
          return log.topics[0] === ethers.id('EmailSent(uint256,address,address,string,uint256)');
        }
        return false;
      }
    );

    let emailId = 0;
    if (emailSentEvent && 'topics' in emailSentEvent && 'data' in emailSentEvent) {
      const parsedLog = contract.interface.parseLog({
        topics: emailSentEvent.topics as string[],
        data: emailSentEvent.data,
      });
      emailId = Number(parsedLog?.args[0] || 0);
    }

    return NextResponse.json({
      success: true,
      emailId,
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
