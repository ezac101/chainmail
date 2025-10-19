import { ethers } from 'ethers';

export interface WalletInfo {
  address: string;
  privateKey: string;
  mnemonic?: string;
  publicKey: string;
  email: string;
}

export class WalletService {
  private static readonly EMAIL_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'blockdag.mailchain';

  /**
   * Generate a new anonymous wallet
   * @returns Wallet information including mnemonic
   */
  static generateWallet(): WalletInfo {
    try {
      const wallet = ethers.Wallet.createRandom();
      const publicKey = wallet.signingKey.publicKey;
      
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic?.phrase,
        publicKey,
        email: `${wallet.address}@${this.EMAIL_DOMAIN}`,
      };
    } catch (err) {
      console.error('Failed to generate wallet:', err);
      throw new Error('Failed to generate wallet');
    }
  }

  /**
   * Restore wallet from mnemonic phrase
   * @param mnemonic 12 or 24 word mnemonic phrase
   * @returns Wallet information
   */
  static fromMnemonic(mnemonic: string): WalletInfo {
    try {
      const wallet = ethers.Wallet.fromPhrase(mnemonic.trim());
      const publicKey = wallet.signingKey.publicKey;
      
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic?.phrase,
        publicKey,
        email: `${wallet.address}@${this.EMAIL_DOMAIN}`,
      };
    } catch (err) {
      console.error('Failed to restore wallet from mnemonic:', err);
      throw new Error('Invalid mnemonic phrase');
    }
  }

  /**
   * Restore wallet from private key
   * @param privateKey Wallet private key
   * @returns Wallet information
   */
  static fromPrivateKey(privateKey: string): WalletInfo {
    try {
      const wallet = new ethers.Wallet(privateKey.trim());
      const publicKey = wallet.signingKey.publicKey;
      
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        publicKey,
        email: `${wallet.address}@${this.EMAIL_DOMAIN}`,
      };
    } catch (err) {
      console.error('Failed to restore wallet from private key:', err);
      throw new Error('Invalid private key');
    }
  }

  /**
   * Extract wallet address from email
   * @param email Email address in format 0x...@domain
   * @returns Wallet address
   */
  static extractAddressFromEmail(email: string): string {
    const address = email.split('@')[0];
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid email format');
    }
    return address;
  }

  /**
   * Format address as email
   * @param address Wallet address
   * @returns Email string
   */
  static formatAsEmail(address: string): string {
    return `${address}@${this.EMAIL_DOMAIN}`;
  }

  /**
   * Get signer from wallet info
   * @param walletInfo Wallet information
   * @returns Ethers signer connected to provider
   */
  static getSigner(walletInfo: WalletInfo): ethers.Wallet {
    const provider = new ethers.JsonRpcProvider(
      process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL
    );
    return new ethers.Wallet(walletInfo.privateKey, provider);
  }

  /**
   * Get provider instance
   * @returns Ethers provider
   */
  static getProvider(): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(
      process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL
    );
  }

  /**
   * Get WebSocket provider for real-time events
   * @returns Ethers WebSocket provider
   */
  static getWebSocketProvider(): ethers.WebSocketProvider {
    return new ethers.WebSocketProvider(
      process.env.NEXT_PUBLIC_BLOCKDAG_WS_URL || ''
    );
  }
}
