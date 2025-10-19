import { ethers } from 'ethers';
import { WalletService } from './wallet.service';

// ChainMail contract ABI
const CHAINMAIL_ABI = [
  'event EmailSent(uint256 indexed emailId, address indexed sender, address indexed recipient, string ipfsHash, uint256 timestamp)',
  'event PublicKeyRegistered(address indexed user, string publicKey, uint256 timestamp)',
  'function logSend(address _recipient, string memory _ipfsHash) public returns (uint256)',
  'function logSendFor(address _sender, address _recipient, string memory _ipfsHash) public returns (uint256)',
  'function getRecipientEmails(address _recipient) public view returns (uint256[] memory)',
  'function getSenderEmails(address _sender) public view returns (uint256[] memory)',
  'function getEmail(uint256 _emailId) public view returns (address sender, address recipient, string memory ipfsHash, uint256 timestamp, bool isImmutable)',
  'function registerPublicKey(string memory _publicKey) public',
  'function registerPublicKeyFor(address _user, string memory _publicKey) public',
  'function getPublicKey(address _user) public view returns (string memory)',
  'function getTotalEmails() public view returns (uint256)',
  'function emailCount() public view returns (uint256)',
  'function owner() public view returns (address)',
  'function relayAddress() public view returns (address)'
];

export interface EmailEvent {
  emailId: number;
  sender: string;
  recipient: string;
  ipfsHash: string;
  timestamp: number;
  transactionHash: string;
}

export interface OnChainEmail {
  sender: string;
  recipient: string;
  ipfsHash: string;
  timestamp: number;
  isImmutable: boolean;
}

export class BlockchainService {
  private static contract: ethers.Contract | null = null;
  private static pollingInterval: NodeJS.Timeout | null = null;
  private static lastProcessedBlock: number = 0;

  /**
   * Get contract instance
   * @param signer Optional signer for write operations
   * @returns Contract instance
   */
  private static getContract(signer?: ethers.Signer): ethers.Contract {
    const contractAddress = process.env.NEXT_PUBLIC_CHAINMAIL_CONTRACT_ADDRESS;
    
    console.log('🔍 [BlockchainService] Environment check:');
    console.log('🔍 [BlockchainService] Contract address from env:', contractAddress);
    console.log('🔍 [BlockchainService] All NEXT_PUBLIC vars:', {
      rpc: process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL,
      contract: process.env.NEXT_PUBLIC_CHAINMAIL_CONTRACT_ADDRESS,
      chainId: process.env.NEXT_PUBLIC_BLOCKDAG_CHAIN_ID,
    });
    
    if (!contractAddress) {
      console.error('❌ [BlockchainService] Contract address is not set in environment variables!');
      console.error('❌ [BlockchainService] Please set NEXT_PUBLIC_CHAINMAIL_CONTRACT_ADDRESS in .env.local');
      throw new Error('Contract address not configured. Please set NEXT_PUBLIC_CHAINMAIL_CONTRACT_ADDRESS in .env.local and restart the dev server.');
    }

    if (!signer) {
      const provider = WalletService.getProvider();
      return new ethers.Contract(contractAddress, CHAINMAIL_ABI, provider);
    }

    return new ethers.Contract(contractAddress, CHAINMAIL_ABI, signer);
  }

    /**
   * Log email send on blockchain
   * @param recipientAddress Recipient wallet address
   * @param ipfsHash IPFS hash of encrypted email
   * @param privateKey Sender's private key
   * @returns Transaction receipt and email ID
   */
  static async logEmailSend(
    recipientAddress: string,
    ipfsHash: string,
    privateKey: string
  ): Promise<{ emailId: number; transactionHash: string; gasUsed: bigint }> {
    try {
      console.log('⛓️  [Blockchain] Starting blockchain logging...');
      console.log('⛓️  [Blockchain] Recipient:', recipientAddress);
      console.log('⛓️  [Blockchain] IPFS Hash:', ipfsHash);
      
      const rpcUrl = process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL;
      if (!rpcUrl) {
        throw new Error('BlockDAG RPC URL not configured');
      }
      console.log('⛓️  [Blockchain] RPC URL:', rpcUrl);

      console.log('⛓️  [Blockchain] Connecting to provider...');
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      console.log('⛓️  [Blockchain] Creating wallet...');
      const wallet = new ethers.Wallet(privateKey, provider);
      console.log('⛓️  [Blockchain] Wallet address:', wallet.address);
      
      console.log('⛓️  [Blockchain] Getting contract instance...');
      const contract = this.getContract(wallet);
      console.log('⛓️  [Blockchain] Contract address:', await contract.getAddress());

      // Call logSend function
      console.log('⛓️  [Blockchain] Calling logSend function...');
      const tx = await contract.logSend(recipientAddress, ipfsHash);
      console.log('⛓️  [Blockchain] Transaction sent:', tx.hash);
      
      console.log('⛓️  [Blockchain] Waiting for confirmation...');
      const receipt = await tx.wait();
      console.log('⛓️  [Blockchain] ✅ Transaction confirmed!');
      console.log('⛓️  [Blockchain] Block number:', receipt.blockNumber);
      console.log('⛓️  [Blockchain] Gas used:', receipt.gasUsed.toString());

      // Extract emailId from event logs
      console.log('⛓️  [Blockchain] Parsing event logs...');
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
        console.log('⛓️  [Blockchain] Email ID from event:', emailId);
      } else {
        console.warn('⚠️  [Blockchain] EmailSent event not found in logs');
      }

      console.log('⛓️  [Blockchain] ✅ Blockchain logging complete');
      return {
        emailId,
        transactionHash: receipt.hash,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      console.error('❌ [Blockchain] Blockchain logging error:', error);
      console.error('❌ [Blockchain] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to log email on blockchain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get emails received by address
   * @param address Recipient address
   * @returns Array of email IDs
   */
  static async getRecipientEmails(address: string): Promise<number[]> {
    try {
      const contract = this.getContract();
      const emailIds = await contract.getRecipientEmails(address);
      return emailIds.map((id: bigint) => Number(id));
    } catch (error) {
      console.error('Error fetching recipient emails:', error);
      throw new Error('Failed to fetch recipient emails');
    }
  }

  /**
   * Get emails sent by address
   * @param address Sender address
   * @returns Array of email IDs
   */
  static async getSenderEmails(address: string): Promise<number[]> {
    try {
      const contract = this.getContract();
      const emailIds = await contract.getSenderEmails(address);
      return emailIds.map((id: bigint) => Number(id));
    } catch (error) {
      console.error('Error fetching sender emails:', error);
      throw new Error('Failed to fetch sender emails');
    }
  }

  /**
   * Get email details by ID
   * @param emailId Email ID
   * @returns Email details
   */
  static async getEmail(emailId: number): Promise<OnChainEmail> {
    try {
      const contract = this.getContract();
      const [sender, recipient, ipfsHash, timestamp, isImmutable] = await contract.getEmail(emailId);

      return {
        sender,
        recipient,
        ipfsHash,
        timestamp: Number(timestamp),
        isImmutable,
      };
    } catch (error) {
      console.error('Error fetching email:', error);
      throw new Error('Failed to fetch email details');
    }
  }

  /**
   * Get total email count
   * @returns Total number of emails
   */
  static async getTotalEmails(): Promise<number> {
    try {
      const contract = this.getContract();
      const count = await contract.getTotalEmails();
      return Number(count);
    } catch (error) {
      console.error('Error fetching total emails:', error);
      return 0;
    }
  }

  /**
   * Register user's PGP public key on-chain
   * @param publicKey User's PGP public key (armored)
   * @param privateKey User's wallet private key for signing
   * @returns Transaction receipt
   */
  static async registerPublicKey(
    publicKey: string,
    privateKey: string
  ): Promise<{ transactionHash: string; gasUsed: bigint }> {
    console.log('🔐 [BlockchainService] ========== REGISTERING PUBLIC KEY ==========');
    console.log('🔐 [BlockchainService] Public key length:', publicKey.length);
    
    try {
      const provider = new ethers.JsonRpcProvider(
        process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL
      );
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = this.getContract(wallet);

      // Check wallet address and balance
      console.log('💰 [BlockchainService] Wallet address:', wallet.address);
      const balance = await provider.getBalance(wallet.address);
      console.log('💰 [BlockchainService] Wallet balance:', ethers.formatEther(balance), 'BDAG');
      
      if (balance === BigInt(0)) {
        throw new Error(`Wallet ${wallet.address} has zero balance. Please fund your wallet with BDAG tokens first.`);
      }
      
      // Estimate gas
      console.log('⛽ [BlockchainService] Estimating gas...');
      const gasEstimate = await contract.registerPublicKey.estimateGas(publicKey);
      console.log('⛽ [BlockchainService] Estimated gas:', gasEstimate.toString());
      
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || BigInt(0);
      console.log('⛽ [BlockchainService] Gas price:', ethers.formatUnits(gasPrice, 'gwei'), 'Gwei');
      
      const estimatedCost = gasEstimate * gasPrice;
      console.log('⛽ [BlockchainService] Estimated transaction cost:', ethers.formatEther(estimatedCost), 'BDAG');

      console.log('🔐 [BlockchainService] Sending transaction...');
      const tx = await contract.registerPublicKey(publicKey);
      
      console.log('🔐 [BlockchainService] Transaction hash:', tx.hash);
      console.log('🔐 [BlockchainService] Waiting for confirmation...');
      
      const receipt = await tx.wait();
      
      console.log('✅ [BlockchainService] Public key registered successfully');
      console.log('✅ [BlockchainService] Gas used:', receipt.gasUsed.toString());
      
      return {
        transactionHash: receipt.hash,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      console.error('❌ [BlockchainService] Error registering public key:', error);
      throw new Error(`Failed to register public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's PGP public key from blockchain
   * @param address User's wallet address
   * @returns User's PGP public key or empty string if not registered
   */
  static async getPublicKey(address: string): Promise<string> {
    console.log('🔍 [BlockchainService] Fetching public key for:', address);
    
    try {
      // Try server-assisted fetch first to avoid stale client env config
      if (typeof fetch !== 'undefined') {
        try {
          const response = await fetch(`/api/relay/get-public-key?address=${address}`);
          if (response.ok) {
            const data = await response.json();
            if (data?.publicKey && data.publicKey.length > 0) {
              console.log('✅ [BlockchainService] Public key retrieved via relay API');
              return data.publicKey as string;
            }
          } else {
            console.warn('⚠️ [BlockchainService] Relay public-key API returned non-OK response', response.status);
          }
        } catch (apiError) {
          console.warn('⚠️ [BlockchainService] Relay public-key API request failed, falling back to direct RPC:', apiError);
        }
      }

      const contract = this.getContract();
      const publicKey = await contract.getPublicKey(address);
      
      if (publicKey && publicKey.length > 0) {
        console.log('✅ [BlockchainService] Public key found, length:', publicKey.length);
      } else {
        console.log('⚠️ [BlockchainService] No public key registered for this address');
      }
      
      return publicKey;
    } catch (error) {
      console.error('❌ [BlockchainService] Error fetching public key:', error);
      throw new Error(`Failed to fetch public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Start polling for new email events (WebSocket alternative)
   * @param recipientAddress Recipient address to filter
   * @param callback Callback function for new emails
   * @param intervalMs Polling interval in milliseconds (default: 5000)
   * @returns Cleanup function
   */
  static startPollingForEmails(
    recipientAddress: string,
    callback: (event: EmailEvent) => void,
    intervalMs: number = 5000
  ): () => void {
    // Clear existing polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Get current block to start from
    const initializePolling = async () => {
      try {
        const provider = WalletService.getProvider();
        this.lastProcessedBlock = await provider.getBlockNumber();
        console.log('Starting email polling from block:', this.lastProcessedBlock);
      } catch (error) {
        console.error('Error initializing polling:', error);
        this.lastProcessedBlock = 0;
      }
    };

    // Initialize
    initializePolling();

    // Poll for new emails
    this.pollingInterval = setInterval(async () => {
      try {
        const contract = this.getContract();
        const provider = WalletService.getProvider();
        const currentBlock = await provider.getBlockNumber();

        // Only query if there are new blocks
        if (currentBlock > this.lastProcessedBlock) {
          const filter = contract.filters.EmailSent(null, null, recipientAddress);
          const events = await contract.queryFilter(filter, this.lastProcessedBlock + 1, currentBlock);

          // Process new events
          for (const event of events) {
            if ('args' in event && event.args) {
              const args = event.args;
              callback({
                emailId: Number(args[0]),
                sender: args[1],
                recipient: args[2],
                ipfsHash: args[3],
                timestamp: Number(args[4]),
                transactionHash: event.transactionHash,
              });
            }
          }

          this.lastProcessedBlock = currentBlock;
        }
      } catch (error) {
        console.error('Error polling for emails:', error);
      }
    }, intervalMs);

    // Return cleanup function
    return () => {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
    };
  }

  /**
   * Query past email events
   * @param recipientAddress Optional recipient filter
   * @param fromBlock Starting block number
   * @returns Array of email events
   */
  static async queryPastEmails(
    recipientAddress?: string,
    fromBlock: number = 0
  ): Promise<EmailEvent[]> {
    try {
      const contract = this.getContract();
      const filter = recipientAddress
        ? contract.filters.EmailSent(null, null, recipientAddress)
        : contract.filters.EmailSent();

      const events = await contract.queryFilter(filter, fromBlock);

      return events.map((event) => {
        if ('args' in event && event.args) {
          return {
            emailId: Number(event.args[0]),
            sender: event.args[1],
            recipient: event.args[2],
            ipfsHash: event.args[3],
            timestamp: Number(event.args[4]),
            transactionHash: event.transactionHash,
          };
        }
        return {
          emailId: 0,
          sender: '',
          recipient: '',
          ipfsHash: '',
          timestamp: 0,
          transactionHash: event.transactionHash,
        };
      });
    } catch (error) {
      console.error('Error querying past emails:', error);
      return [];
    }
  }

  /**
   * Get transaction receipt
   * @param transactionHash Transaction hash
   * @returns Transaction receipt
   */
  static async getTransactionReceipt(transactionHash: string) {
    try {
      const provider = WalletService.getProvider();
      return await provider.getTransactionReceipt(transactionHash);
    } catch (error) {
      console.error('Error fetching transaction receipt:', error);
      return null;
    }
  }

  /**
   * Estimate gas for logSend transaction
   * @param recipientAddress Recipient address
   * @param ipfsHash IPFS hash
   * @param privateKey Sender's private key
   * @returns Estimated gas
   */
  static async estimateGas(
    recipientAddress: string,
    ipfsHash: string,
    privateKey: string
  ): Promise<bigint> {
    try {
      const provider = WalletService.getProvider();
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = this.getContract(wallet);

      return await contract.logSend.estimateGas(recipientAddress, ipfsHash);
    } catch (error) {
      console.error('Error estimating gas:', error);
      return BigInt(0);
    }
  }

  /**
   * Log email send using relay wallet (no gas required from user)
   * @param recipientAddress Recipient wallet address
   * @param ipfsHash IPFS hash of encrypted email
   * @param userAddress User's wallet address (for logging)
   * @returns Transaction receipt and email ID
   */
  static async logEmailSendRelay(
    recipientAddress: string,
    ipfsHash: string,
    userAddress: string
  ): Promise<{ emailId: number; transactionHash: string; gasUsed: bigint }> {
    try {
      console.log('💰 [BlockchainRelay] Sending transaction via relay...');
      
      const response = await fetch('/api/relay/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientAddress,
          ipfsHash,
          userAddress,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Relay transaction failed');
      }

      const result = await response.json();
      console.log('✅ [BlockchainRelay] Transaction successful:', result.transactionHash);

      return {
        emailId: result.emailId,
        transactionHash: result.transactionHash,
        gasUsed: BigInt(result.gasUsed),
      };
    } catch (error) {
      console.error('❌ [BlockchainRelay] Error:', error);
      throw new Error(`Failed to send via relay: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Register public key using relay wallet (no gas required from user)
   * @param publicKey User's PGP public key
   * @param userAddress User's wallet address
   */
  static async registerPublicKeyRelay(
    publicKey: string,
    userAddress: string
  ): Promise<{ transactionHash: string; gasUsed: bigint }> {
    try {
      console.log('💰 [BlockchainRelay] Registering public key via relay...');
      
      const response = await fetch('/api/relay/register-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicKey,
          userAddress,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Relay transaction failed');
      }

      const result = await response.json();
      console.log('✅ [BlockchainRelay] Public key registered:', result.transactionHash);

      return {
        transactionHash: result.transactionHash,
        gasUsed: BigInt(result.gasUsed),
      };
    } catch (error) {
      console.error('❌ [BlockchainRelay] Error:', error);
      throw new Error(`Failed to register via relay: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
