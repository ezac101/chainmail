import * as openpgp from 'openpgp';

export interface EncryptedEmail {
  encryptedContent: string;
  sender: string;
  recipient: string;
  subject: string;
  timestamp: number;
}

export interface DecryptedEmail {
  subject: string;
  body: string;
  sender: string;
  recipient: string;
  timestamp: number;
}

export class EncryptionService {
  /**
   * Generate PGP key pair from wallet private key
   * @param privateKey Wallet private key
   * @param address Wallet address
   * @returns PGP key pair
   */
  static async generateKeyPair(privateKey: string, address: string) {
    const { privateKey: pgpPrivateKey, publicKey: pgpPublicKey } = await openpgp.generateKey({
      type: 'rsa',
      rsaBits: 2048,
      userIDs: [{ name: address, email: `${address}@blockdag.mailchain` }],
      passphrase: privateKey, // Use wallet private key as passphrase
    });

    return {
      privateKey: pgpPrivateKey,
      publicKey: pgpPublicKey,
    };
  }

  /**
   * Encrypt email content
   * @param subject Email subject
   * @param body Email body
   * @param sender Sender address
   * @param recipient Recipient address
   * @param recipientPublicKeyArmored Recipient's public key
   * @returns Encrypted content
   */
  static async encryptEmail(
    subject: string,
    body: string,
    sender: string,
    recipient: string,
    recipientPublicKeyArmored: string
  ): Promise<string> {
    try {
      console.log('🔐 [Encryption] Starting email encryption...');
      console.log('🔐 [Encryption] Sender:', sender);
      console.log('🔐 [Encryption] Recipient:', recipient);
      console.log('🔐 [Encryption] Subject:', subject);
      console.log('🔐 [Encryption] Recipient public key length:', recipientPublicKeyArmored?.length || 0);
      
      if (!recipientPublicKeyArmored || recipientPublicKeyArmored.trim() === '') {
        throw new Error('Recipient public key is empty or invalid');
      }

      console.log('🔐 [Encryption] Reading recipient public key...');
      const publicKey = await openpgp.readKey({ armoredKey: recipientPublicKeyArmored });
      console.log('🔐 [Encryption] Public key read successfully');

      const emailData = JSON.stringify({
        subject,
        body,
        sender,
        recipient,
        timestamp: Date.now(),
      });
      console.log('🔐 [Encryption] Email data prepared, size:', emailData.length, 'bytes');

      console.log('🔐 [Encryption] Creating message...');
      const message = await openpgp.createMessage({ text: emailData });
      
      console.log('🔐 [Encryption] Encrypting message...');
      const encrypted = await openpgp.encrypt({
        message,
        encryptionKeys: publicKey,
      });

      console.log('🔐 [Encryption] ✅ Encryption successful, size:', encrypted.length, 'bytes');
      return encrypted;
    } catch (error) {
      console.error('❌ [Encryption] Encryption error:', error);
      console.error('❌ [Encryption] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to encrypt email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt email content
   * @param encryptedContent Encrypted email content
   * @param privateKeyArmored Private key in armored format
   * @param walletPrivateKey Wallet private key (used as passphrase)
   * @returns Decrypted email data
   */
  static async decryptEmail(
    encryptedContent: string,
    privateKeyArmored: string,
    walletPrivateKey: string
  ): Promise<DecryptedEmail> {
    try {
      console.log('🔓 [Decryption] Starting email decryption...');
      console.log('🔓 [Decryption] Encrypted content length:', encryptedContent?.length || 0);
      console.log('🔓 [Decryption] Private key length:', privateKeyArmored?.length || 0);
      console.log('🔓 [Decryption] First 200 chars of content:', encryptedContent?.substring(0, 200));
      console.log('🔓 [Decryption] Content type:', typeof encryptedContent);
      console.log('🔓 [Decryption] Is PGP message:', encryptedContent?.includes('-----BEGIN PGP MESSAGE-----'));
      
      // If the content is a JSON object (from IPFS wrapper), extract the actual content
      let actualContent = encryptedContent;
      if (typeof encryptedContent === 'string' && encryptedContent.trim().startsWith('{')) {
        try {
          console.log('🔓 [Decryption] Content looks like JSON, attempting to parse...');
          const parsed = JSON.parse(encryptedContent);
          if (parsed && typeof parsed === 'object' && 'content' in parsed) {
            console.log('🔓 [Decryption] Extracted content from JSON wrapper');
            actualContent = parsed.content;
          }
        } catch {
          console.log('🔓 [Decryption] JSON parse failed, using content as-is');
        }
      }
      
      console.log('🔓 [Decryption] Final content length:', actualContent?.length || 0);
      console.log('🔓 [Decryption] Final content starts with:', actualContent?.substring(0, 50));
      
      if (!privateKeyArmored || privateKeyArmored.trim() === '') {
        throw new Error('Private key is empty or invalid');
      }
      
      if (!walletPrivateKey || walletPrivateKey.trim() === '') {
        throw new Error('Wallet private key (passphrase) is empty or invalid');
      }

      console.log('🔓 [Decryption] Reading private key...');
      const encryptedPrivateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
      
      console.log('🔓 [Decryption] Decrypting private key with passphrase...');
      const privateKey = await openpgp.decryptKey({
        privateKey: encryptedPrivateKey,
        passphrase: walletPrivateKey,
      });
      console.log('🔓 [Decryption] Private key decrypted successfully');

      console.log('🔓 [Decryption] Reading encrypted message...');
      const message = await openpgp.readMessage({ armoredMessage: actualContent });

      console.log('🔓 [Decryption] Decrypting message...');
      const { data: decrypted } = await openpgp.decrypt({
        message,
        decryptionKeys: privateKey,
      });

      console.log('🔓 [Decryption] Parsing decrypted data...');
      const emailData = JSON.parse(decrypted as string);

      console.log('🔓 [Decryption] ✅ Decryption successful');
      return {
        subject: emailData.subject,
        body: emailData.body,
        sender: emailData.sender,
        recipient: emailData.recipient,
        timestamp: emailData.timestamp,
      };
    } catch (error) {
      console.error('❌ [Decryption] Decryption error:', error);
      console.error('❌ [Decryption] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to decrypt email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get public key from address (simplified - in production, fetch from a key server or on-chain storage)
   * For now, we'll generate it from the address
   * @param address Wallet address
   * @returns Public key
   */
  static async getPublicKey(address: string): Promise<string> {
    // In a real implementation, you would:
    // 1. Query a key server
    // 2. Fetch from on-chain storage
    // 3. Use a decentralized identity system
    
    // For this implementation, we'll use a deterministic approach
    // In production, users should publish their public keys
    const { publicKey } = await openpgp.generateKey({
      type: 'rsa',
      rsaBits: 2048,
      userIDs: [{ name: address, email: `${address}@blockdag.mailchain` }],
      passphrase: address, // Deterministic but not secure - replace in production
    });

    return publicKey;
  }

  /**
   * Sign content with private key
   * @param content Content to sign
   * @param privateKey PGP private key
   * @param walletPrivateKey Wallet private key (passphrase)
   * @returns Signed content
   */
  static async signContent(
    content: string,
    privateKey: string,
    walletPrivateKey: string
  ): Promise<string> {
    const pgpPrivateKey = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: privateKey }),
      passphrase: walletPrivateKey,
    });

    const message = await openpgp.createMessage({ text: content });
    const signed = await openpgp.sign({
      message,
      signingKeys: pgpPrivateKey,
    });

    return signed as string;
  }

  /**
   * Verify signed content
   * @param signedContent Signed content
   * @param publicKey Signer's public key
   * @returns Verification result
   */
  static async verifySignature(
    signedContent: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      const message = await openpgp.readMessage({
        armoredMessage: signedContent,
      });

      const pgpPublicKey = await openpgp.readKey({ armoredKey: publicKey });

      const verificationResult = await openpgp.verify({
        message,
        verificationKeys: pgpPublicKey,
      });

      const { verified } = verificationResult.signatures[0];
      await verified;

      return true;
    } catch {
      return false;
    }
  }
}
