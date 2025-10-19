import axios from 'axios';

export interface IPFSUploadResult {
  ipfsHash: string;
  pinSize: number;
  timestamp: string;
}

export class IPFSService {
  private static readonly PINATA_API_URL = 'https://api.pinata.cloud';
  private static readonly PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
  private static readonly PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY || '';
  private static readonly PINATA_SECRET_KEY = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY || '';

  /**
   * Upload content to IPFS via Pinata
   * @param content Content to upload
   * @param metadata Optional metadata
   * @returns IPFS hash and upload details
   */
  static async uploadToIPFS(
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<IPFSUploadResult> {
    try {
      console.log('📦 [IPFS] Starting IPFS upload...');
      console.log('📦 [IPFS] Content length:', content.length, 'bytes');
      console.log('📦 [IPFS] Metadata:', metadata);
      
      const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

      const data = {
        pinataContent: {
          content,
          metadata,
        },
        pinataMetadata: {
          name: `chainmail-${Date.now()}`,
        },
        pinataOptions: {
          cidVersion: 1,
        },
      };

      console.log('📦 [IPFS] Sending request to Pinata...');
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          pinata_api_key: this.PINATA_API_KEY,
          pinata_secret_api_key: this.PINATA_SECRET_KEY,
        },
      });

      console.log('📦 [IPFS] ✅ Upload successful!');
      console.log('📦 [IPFS] IPFS Hash:', response.data.IpfsHash);
      console.log('📦 [IPFS] Pin Size:', response.data.PinSize);
      
      return {
        ipfsHash: response.data.IpfsHash,
        pinSize: response.data.PinSize,
        timestamp: response.data.Timestamp,
      };
    } catch (error) {
      console.error('❌ [IPFS] Upload error:', error);
      if (axios.isAxiosError(error)) {
        console.error('❌ [IPFS] Response status:', error.response?.status);
        console.error('❌ [IPFS] Response data:', error.response?.data);
      }
      throw new Error(`Failed to upload to IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch content from IPFS via Pinata gateway
   * @param ipfsHash IPFS hash (CID)
   * @returns Email content
   */
  static async fetchFromIPFS(ipfsHash: string): Promise<string> {
    try {
      console.log('📦 [IPFS] Fetching from IPFS...');
      console.log('📦 [IPFS] Hash:', ipfsHash);
      
      const response = await axios.get(
        `${this.PINATA_GATEWAY}/ipfs/${ipfsHash}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      console.log('📦 [IPFS] Response received');
      console.log('📦 [IPFS] Response type:', typeof response.data);
      console.log('📦 [IPFS] Response keys:', Object.keys(response.data));
      
      // The data is stored as {content: "...", metadata: {...}}
      // We need to extract just the content field
      if (response.data && typeof response.data === 'object' && 'content' in response.data) {
        console.log('📦 [IPFS] ✅ Extracted content from wrapper object');
        console.log('📦 [IPFS] Content length:', response.data.content.length);
        return response.data.content;
      }
      
      // If it's already a string, return as-is
      if (typeof response.data === 'string') {
        console.log('📦 [IPFS] ✅ Content is already a string');
        return response.data;
      }
      
      console.error('❌ [IPFS] Unexpected response format:', response.data);
      throw new Error('Unexpected IPFS response format');
    } catch (error) {
      console.error('❌ [IPFS] Fetch error:', error);
      if (axios.isAxiosError(error)) {
        console.error('❌ [IPFS] Response status:', error.response?.status);
        console.error('❌ [IPFS] Response data:', error.response?.data);
      }
      throw new Error(`Failed to fetch from IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get IPFS gateway URL for a hash
   * @param ipfsHash IPFS hash (CID)
   * @returns Full gateway URL
   */
  static getGatewayUrl(ipfsHash: string): string {
    return `${this.PINATA_GATEWAY}/ipfs/${ipfsHash}`;
  }

  /**
   * Pin existing IPFS hash to Pinata
   * @param ipfsHash IPFS hash to pin
   * @param name Optional name for the pin
   * @returns Pin result
   */
  static async pinByHash(ipfsHash: string, name?: string): Promise<unknown> {
    try {
      const data = JSON.stringify({
        hashToPin: ipfsHash,
        pinataMetadata: {
          name: name || `chainmail-pin-${Date.now()}`,
        },
      });

      const response = await axios.post(
        `${this.PINATA_API_URL}/pinning/pinByHash`,
        data,
        {
          headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': process.env.NEXT_PUBLIC_PINATA_API_KEY || '',
            'pinata_secret_api_key': process.env.NEXT_PUBLIC_PINATA_SECRET_KEY || '',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error pinning hash:', error);
      throw new Error('Failed to pin hash');
    }
  }

  /**
   * Unpin content from Pinata (optional - for cleanup)
   * @param ipfsHash IPFS hash to unpin
   */
  static async unpinFromIPFS(ipfsHash: string): Promise<void> {
    try {
      await axios.delete(
        `${this.PINATA_API_URL}/pinning/unpin/${ipfsHash}`,
        {
          headers: {
            'pinata_api_key': process.env.NEXT_PUBLIC_PINATA_API_KEY || '',
            'pinata_secret_api_key': process.env.NEXT_PUBLIC_PINATA_SECRET_KEY || '',
          },
        }
      );
    } catch (error) {
      console.error('Error unpinning from IPFS:', error);
      throw new Error('Failed to unpin from IPFS');
    }
  }

  /**
   * Test Pinata connection
   * @returns Connection status
   */
  static async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.PINATA_API_URL}/data/testAuthentication`,
        {
          headers: {
            'pinata_api_key': process.env.NEXT_PUBLIC_PINATA_API_KEY || '',
            'pinata_secret_api_key': process.env.NEXT_PUBLIC_PINATA_SECRET_KEY || '',
          },
        }
      );

      return response.data.message === 'Congratulations! You are communicating with the Pinata API!';
    } catch (error) {
      console.error('Pinata connection test failed:', error);
      return false;
    }
  }
}
