import { EncryptionService } from './encryption.service';
import { IPFSService } from './ipfs.service';
import { BlockchainService, OnChainEmail } from './blockchain.service';

export interface EmailData {
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{ name: string; content: string; type: string }>;
}

export interface DecryptedEmail {
  emailId: number;
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{ name: string; content: string; type: string }>;
  timestamp: number;
  transactionHash: string;
  ipfsHash: string;
  isImmutable: boolean;
}

export interface EmailMetadata {
  emailId: number;
  from: string;
  to: string;
  timestamp: number;
  transactionHash: string;
  ipfsHash: string;
  isImmutable: boolean;
}

export class EmailService {
      /**
   * Send an email
   * @param emailData Email content
   * @param senderPrivateKey Sender's wallet private key
   * @param senderPrivateKeyArmored Sender's PGP private key
   * @param senderAddress Sender's wallet address
   * @returns Email ID and transaction details
   */
  static async sendEmail(
    emailData: { to: string; subject: string; body: string },
    senderPrivateKey: string,
    senderPrivateKeyArmored: string,
    senderAddress: string
  ): Promise<{ emailId: number; transactionHash: string; ipfsHash: string }> {
    try {
      console.log('📧 [EmailService] ========== STARTING EMAIL SEND ==========');
      console.log('📧 [EmailService] From:', senderAddress);
      console.log('📧 [EmailService] To:', emailData.to);
      console.log('📧 [EmailService] Subject:', emailData.subject);
      console.log('📧 [EmailService] Body length:', emailData.body.length);
      
      // Validate inputs
      if (!senderPrivateKey || senderPrivateKey.trim() === '') {
        throw new Error('Sender private key is required');
      }
      if (!senderAddress || senderAddress.trim() === '') {
        throw new Error('Sender address is required');
      }
      
      console.log('📧 [EmailService] Validation passed ✅');
      
      // Fetch recipient's public key from blockchain
      console.log('📧 [EmailService] Fetching recipient public key from blockchain...');
      const recipientPublicKeyArmored = await BlockchainService.getPublicKey(emailData.to);
      
      if (!recipientPublicKeyArmored || recipientPublicKeyArmored.trim() === '') {
        throw new Error('Recipient has not registered their public key. They need to login to ChainMail first.');
      }
      
      console.log('✅ [EmailService] Recipient public key found');

      // 1. Encrypt email
      console.log('📧 [EmailService] Step 1/3: Encrypting email...');
      const encryptedContent = await EncryptionService.encryptEmail(
        emailData.subject,
        emailData.body,
        senderAddress,
        emailData.to,
        recipientPublicKeyArmored
      );
      console.log('📧 [EmailService] Step 1/3: ✅ Email encrypted');

      // 2. Upload to IPFS
      console.log('📧 [EmailService] Step 2/3: Uploading to IPFS...');
      const ipfsResult = await IPFSService.uploadToIPFS(encryptedContent);
      console.log('📧 [EmailService] Step 2/3: ✅ Uploaded to IPFS:', ipfsResult.ipfsHash);

      // 3. Log on blockchain using relay (no gas required from user)
      console.log('📧 [EmailService] Step 3/3: Logging on blockchain via relay...');
      const blockchainResult = await BlockchainService.logEmailSendRelay(
        emailData.to,
        ipfsResult.ipfsHash,
        senderAddress
      );
      console.log('📧 [EmailService] Step 3/3: ✅ Logged on blockchain');
      console.log('📧 [EmailService] Transaction hash:', blockchainResult.transactionHash);
      console.log('📧 [EmailService] Email ID:', blockchainResult.emailId);

      console.log('📧 [EmailService] ========== EMAIL SENT SUCCESSFULLY ==========');
      return {
        emailId: blockchainResult.emailId,
        transactionHash: blockchainResult.transactionHash,
        ipfsHash: ipfsResult.ipfsHash,
      };
    } catch (error) {
      console.error('❌ [EmailService] ========== EMAIL SEND FAILED ==========');
      console.error('❌ [EmailService] Error:', error);
      console.error('❌ [EmailService] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Fetch and decrypt email
   * @param emailId Email ID from blockchain
   * @param recipientPrivateKeyArmored Recipient's OpenPGP private key (armored)
   * @param walletPrivateKey Wallet private key (used as passphrase)
   * @returns Decrypted email content
   */
  static async fetchAndDecryptEmail(
    emailId: number,
    recipientPrivateKeyArmored: string,
    walletPrivateKey: string
  ): Promise<DecryptedEmail> {
    try {
      // Step 1: Get email metadata from blockchain
      console.log('📧 [EmailService] Fetching email metadata from blockchain...');
      const onChainEmail: OnChainEmail = await BlockchainService.getEmail(emailId);
      console.log('📧 [EmailService] Email metadata:', {
        sender: onChainEmail.sender,
        recipient: onChainEmail.recipient,
        ipfsHash: onChainEmail.ipfsHash,
        timestamp: onChainEmail.timestamp
      });

      // Step 2: Fetch encrypted content from IPFS
      console.log('📧 [EmailService] Fetching encrypted content from IPFS...');
      const encryptedContent = await IPFSService.fetchFromIPFS(onChainEmail.ipfsHash);
      console.log('📧 [EmailService] ✅ Encrypted content fetched');
      console.log('📧 [EmailService] Encrypted content type:', typeof encryptedContent);
      console.log('📧 [EmailService] Encrypted content length:', encryptedContent?.length || 0);

      // Step 3: Decrypt content
      console.log('📧 [EmailService] Decrypting email...');
      const decryptedData = await EncryptionService.decryptEmail(
        encryptedContent,
        recipientPrivateKeyArmored,
        walletPrivateKey
      );
      console.log('📧 [EmailService] ✅ Email decrypted successfully');

      return {
        emailId,
        from: onChainEmail.sender,
        to: onChainEmail.recipient,
        subject: decryptedData.subject,
        body: decryptedData.body,
        attachments: undefined, // Attachments not supported in current implementation
        timestamp: onChainEmail.timestamp,
        transactionHash: '', // Not available from getEmail
        ipfsHash: onChainEmail.ipfsHash,
        isImmutable: onChainEmail.isImmutable,
      };
    } catch (error) {
      console.error('Error fetching email:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch email');
    }
  }

  /**
   * Get all emails for recipient address
   * @param recipientAddress Recipient wallet address
   * @returns Array of email metadata
   */
  static async getRecipientEmails(recipientAddress: string): Promise<EmailMetadata[]> {
    try {
      // Get email IDs from blockchain
      const emailIds = await BlockchainService.getRecipientEmails(recipientAddress);

      // Fetch metadata for each email
      const emails = await Promise.all(
        emailIds.map(async (emailId) => {
          const onChainEmail = await BlockchainService.getEmail(emailId);
          return {
            emailId,
            from: onChainEmail.sender,
            to: onChainEmail.recipient,
            timestamp: onChainEmail.timestamp,
            transactionHash: '',
            ipfsHash: onChainEmail.ipfsHash,
            isImmutable: onChainEmail.isImmutable,
          };
        })
      );

      // Sort by timestamp descending (newest first)
      return emails.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Error fetching recipient emails:', error);
      return [];
    }
  }

  /**
   * Get all emails sent by address
   * @param senderAddress Sender wallet address
   * @returns Array of email metadata
   */
  static async getSenderEmails(senderAddress: string): Promise<EmailMetadata[]> {
    try {
      // Get email IDs from blockchain
      const emailIds = await BlockchainService.getSenderEmails(senderAddress);

      // Fetch metadata for each email
      const emails = await Promise.all(
        emailIds.map(async (emailId) => {
          const onChainEmail = await BlockchainService.getEmail(emailId);
          return {
            emailId,
            from: onChainEmail.sender,
            to: onChainEmail.recipient,
            timestamp: onChainEmail.timestamp,
            transactionHash: '',
            ipfsHash: onChainEmail.ipfsHash,
            isImmutable: onChainEmail.isImmutable,
          };
        })
      );

      // Sort by timestamp descending (newest first)
      return emails.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Error fetching sender emails:', error);
      return [];
    }
  }

    /**
   * Poll for new emails (since WebSocket is disabled)
   * @param recipientAddress Recipient wallet address
   * @param callback Callback function when new emails are found
   * @param intervalMs Polling interval in milliseconds (default: 10000ms = 10s)
   * @returns Cleanup function to stop polling
   */
  static pollForNewEmails(
    recipientAddress: string,
    callback: (emails: EmailMetadata[]) => void,
    intervalMs: number = 10000
  ): () => void {
    let lastEmailCount = 0;

    const poll = async () => {
      try {
        const emailIds = await BlockchainService.getRecipientEmails(recipientAddress);
        
        // Check if there are new emails
        if (emailIds.length > lastEmailCount) {
          const newEmailIds = emailIds.slice(lastEmailCount);
          lastEmailCount = emailIds.length;
          
          // Fetch metadata for new emails
          const newEmails: EmailMetadata[] = [];
          for (const emailId of newEmailIds) {
            const emailData = await BlockchainService.getEmail(emailId);
            newEmails.push({
              emailId,
              from: emailData.sender,
              to: emailData.recipient,
              timestamp: emailData.timestamp,
              transactionHash: '', // Not available from getEmail
              ipfsHash: emailData.ipfsHash,
              isImmutable: emailData.isImmutable,
            });
          }
          
          callback(newEmails);
        }
      } catch (error) {
        console.error('Error polling for new emails:', error);
      }
    };

    // Initial poll
    poll();

    // Set up interval
    const intervalId = setInterval(poll, intervalMs);

    // Return cleanup function
    return () => {
      clearInterval(intervalId);
    };
  }

  /**
   * Query past emails from blockchain events
   * @param recipientAddress Recipient address
   * @param fromBlock Starting block number
   * @returns Array of email metadata
   */
  static async queryPastEmails(
    recipientAddress: string,
    fromBlock: number = 0
  ): Promise<EmailMetadata[]> {
    try {
      const events = await BlockchainService.queryPastEmails(recipientAddress, fromBlock);
      
      return events.map((event) => ({
        emailId: event.emailId,
        from: event.sender,
        to: event.recipient,
        timestamp: event.timestamp,
        transactionHash: event.transactionHash,
        ipfsHash: event.ipfsHash,
        isImmutable: true,
      }));
    } catch (error) {
      console.error('Error querying past emails:', error);
      return [];
    }
  }

  /**
   * Generate OpenPGP key pair for user
   * @param name User's name
   * @param email User's wallet address (used as email)
   * @returns Public and private keys (armored)
   */
  static async generateEncryptionKeys(
    name: string,
    email: string
  ): Promise<{ publicKey: string; privateKey: string }> {
    return EncryptionService.generateKeyPair(name, email);
  }

  /**
   * Get public key from private key
   * @param privateKeyArmored Private key (armored)
   * @returns Public key (armored)
   */
  static async getPublicKey(privateKeyArmored: string): Promise<string> {
    return EncryptionService.getPublicKey(privateKeyArmored);
  }

  /**
   * Reply to an email
   * @param originalEmail Original email to reply to
   * @param replyBody Reply message body
   * @param senderPrivateKey Sender's blockchain private key
   * @param senderPrivateKeyArmored Sender's OpenPGP private key
   * @param senderAddress Sender's wallet address
   * @returns Email ID and transaction details
   */
  static async replyToEmail(
    originalEmail: DecryptedEmail,
    replyBody: string,
    senderPrivateKey: string,
    senderPrivateKeyArmored: string,
    senderAddress: string
  ): Promise<{ emailId: number; transactionHash: string; ipfsHash: string }> {
    const replyData: EmailData = {
      to: originalEmail.from, // Reply to sender
      subject: `Re: ${originalEmail.subject}`,
      body: replyBody,
    };

    return this.sendEmail(
      replyData,
      senderPrivateKey,
      senderPrivateKeyArmored,
      senderAddress
    );
  }

  /**
   * Get email stats
   * @param address Wallet address
   * @returns Email statistics
   */
  static async getEmailStats(address: string): Promise<{
    received: number;
    sent: number;
    total: number;
  }> {
    try {
      const [receivedIds, sentIds, totalEmails] = await Promise.all([
        BlockchainService.getRecipientEmails(address),
        BlockchainService.getSenderEmails(address),
        BlockchainService.getTotalEmails(),
      ]);

      return {
        received: receivedIds.length,
        sent: sentIds.length,
        total: totalEmails,
      };
    } catch (error) {
      console.error('Error fetching email stats:', error);
      return { received: 0, sent: 0, total: 0 };
    }
  }

  /**
   * Test IPFS connection
   * @returns true if connection successful
   */
  static async testIPFSConnection(): Promise<boolean> {
    return IPFSService.testConnection();
  }

  /**
   * Estimate transaction cost for sending email
   * @param recipientAddress Recipient address
   * @param senderPrivateKey Sender's private key
   * @returns Estimated gas cost
   */
  static async estimateSendCost(
    recipientAddress: string,
    senderPrivateKey: string
  ): Promise<bigint> {
    const dummyIpfsHash = 'QmTest123456789'; // Placeholder for estimation
    return BlockchainService.estimateGas(recipientAddress, dummyIpfsHash, senderPrivateKey);
  }
}
