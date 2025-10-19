import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

const CHAINMAIL_ABI = [
  'function getPublicKey(address _user) public view returns (string memory)',
];

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Missing address parameter' },
        { status: 400 }
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

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, CHAINMAIL_ABI, provider);

    const publicKey = await contract.getPublicKey(address);

    return NextResponse.json({ publicKey });
  } catch (error) {
    console.error('❌ [Relay API] Failed to fetch public key:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
