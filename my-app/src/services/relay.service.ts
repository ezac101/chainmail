import { ethers } from 'ethers';

/**
 * Relay Service - Handles gas fee payments for all users
 * The relay wallet pays for all blockchain transactions
 */
export class RelayService {
  private static relayWallet: ethers.Wallet | null = null;
  private static provider: ethers.JsonRpcProvider | null = null;

  /**
   * Initialize the relay wallet from environment variable
   */
  private static initializeRelayWallet(): ethers.Wallet {
    if (this.relayWallet) {
      return this.relayWallet;
    }

    const relayPrivateKey = process.env.RELAY_WALLET_PRIVATE_KEY;
    
    if (!relayPrivateKey || relayPrivateKey === 'your_relay_wallet_private_key_here') {
      throw new Error('RELAY_WALLET_PRIVATE_KEY not configured in .env.local');
    }

    const rpcUrl = process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL;
    if (!rpcUrl) {
      throw new Error('NEXT_PUBLIC_BLOCKDAG_RPC_URL not configured');
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.relayWallet = new ethers.Wallet(relayPrivateKey, this.provider);

    console.log('💰 [RelayService] Relay wallet initialized:', this.relayWallet.address);
    
    return this.relayWallet;
  }

  /**
   * Get the relay wallet instance
   */
  static getRelayWallet(): ethers.Wallet {
    return this.initializeRelayWallet();
  }

  /**
   * Check relay wallet balance
   */
  static async getBalance(): Promise<string> {
    const wallet = this.getRelayWallet();
    if (!wallet.provider) {
      throw new Error('Provider not initialized');
    }
    const balance = await wallet.provider.getBalance(wallet.address);
    return ethers.formatEther(balance);
  }

  /**
   * Execute a transaction using the relay wallet
   * This allows users to interact with the blockchain without having funds
   */
  static async executeTransaction(
    contractAddress: string,
    contractABI: ethers.InterfaceAbi,
    functionName: string,
    args: unknown[]
  ): Promise<{ transactionHash: string; receipt: ethers.TransactionReceipt }> {
    try {
      console.log('🔄 [RelayService] ========== EXECUTING RELAYED TRANSACTION ==========');
      console.log('🔄 [RelayService] Function:', functionName);
      console.log('🔄 [RelayService] Args:', args);

      const wallet = this.getRelayWallet();
      
      // Check relay wallet balance
      const balance = await this.getBalance();
      console.log('💰 [RelayService] Relay wallet balance:', balance, 'BDAG');
      
      if (parseFloat(balance) < 0.001) {
        throw new Error('Relay wallet balance too low. Please fund the relay wallet.');
      }

      // Create contract instance with relay wallet
      const contract = new ethers.Contract(contractAddress, contractABI, wallet);

      // Estimate gas
      console.log('⛽ [RelayService] Estimating gas...');
      const gasEstimate = await contract[functionName].estimateGas(...args);
      console.log('⛽ [RelayService] Estimated gas:', gasEstimate.toString());

      // Send transaction
      console.log('📤 [RelayService] Sending transaction...');
      const tx = await contract[functionName](...args);
      console.log('📤 [RelayService] Transaction hash:', tx.hash);

      // Wait for confirmation
      console.log('⏳ [RelayService] Waiting for confirmation...');
      const receipt = await tx.wait();
      console.log('✅ [RelayService] Transaction confirmed in block:', receipt.blockNumber);
      console.log('✅ [RelayService] Gas used:', receipt.gasUsed.toString());

      const newBalance = await this.getBalance();
      console.log('💰 [RelayService] New relay wallet balance:', newBalance, 'BDAG');

      return {
        transactionHash: receipt.hash,
        receipt
      };
    } catch (error) {
      console.error('❌ [RelayService] Transaction failed:', error);
      throw error;
    }
  }

  /**
   * Sign a message with the user's wallet (for authentication)
   * This doesn't cost gas
   */
  static async signMessage(message: string, userPrivateKey: string): Promise<string> {
    const wallet = new ethers.Wallet(userPrivateKey);
    return await wallet.signMessage(message);
  }
}
