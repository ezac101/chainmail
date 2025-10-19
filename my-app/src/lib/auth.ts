import { WalletInfo } from '@/services/wallet.service';

const WALLET_COOKIE_NAME = 'chainmail_wallet';
const WALLET_STORAGE_PREFIX = 'CHAINMAIL_WALLET_';
const PGP_KEYS_STORAGE_PREFIX = 'PGP_KEYS_';

export interface StoredWalletInfo extends WalletInfo {
  pgpPrivateKey?: string;
  pgpPublicKey?: string;
}

/**
 * Save wallet info to cookies (persists forever)
 */
export function saveWalletToCookies(walletInfo: WalletInfo): void {
  console.log('💾 [Auth] Saving wallet to cookies:');
  console.log('   Address:', walletInfo.address);
  console.log('   Email:', walletInfo.email);
  console.log('   Has mnemonic:', !!walletInfo.mnemonic);
  
  // Set cookie that expires in 10 years (essentially forever)
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 10);
  
  const walletData = JSON.stringify(walletInfo);
  document.cookie = `${WALLET_COOKIE_NAME}=${encodeURIComponent(walletData)}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
  
  console.log('✅ [Auth] Wallet saved to cookies');

  // Persist sensitive fields in localStorage to avoid cookie size limits or truncation
  if (typeof window !== 'undefined') {
    try {
      const storageKey = `${WALLET_STORAGE_PREFIX}${walletInfo.address}`;
      const payload = JSON.stringify({
        privateKey: walletInfo.privateKey,
        mnemonic: walletInfo.mnemonic,
        publicKey: walletInfo.publicKey,
        email: walletInfo.email,
      });
      localStorage.setItem(storageKey, payload);
      console.log('✅ [Auth] Wallet saved to localStorage with key:', storageKey);
    } catch (error) {
      console.error('❌ [Auth] Failed to save wallet to localStorage:', error);
    }
  }
}

/**
 * Save PGP keys to localStorage (cookies are too small for large PGP keys)
 * @param privateKey PGP private key
 * @param publicKey PGP public key
 * @param walletAddress Wallet address (used for address-specific storage)
 */
export function savePGPKeysToCookies(privateKey: string, publicKey: string, walletAddress: string): void {
  console.log('💾 [Auth] Saving PGP keys to localStorage...');
  console.log('   Wallet address:', walletAddress);
  console.log('   Public key length:', publicKey.length);
  console.log('   Private key length:', privateKey.length);
  
  try {
  const keysData = JSON.stringify({ privateKey, publicKey });
  // Use wallet-specific key for storage
  const storageKey = `${PGP_KEYS_STORAGE_PREFIX}${walletAddress}`;
    localStorage.setItem(storageKey, keysData);
    
    console.log('✅ [Auth] PGP keys saved to localStorage with key:', storageKey);
    
    // Verify by reading back
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      console.log('✅ [Auth] localStorage verification successful');
    } else {
      console.error('❌ [Auth] localStorage verification failed!');
    }
  } catch (error) {
    console.error('❌ [Auth] Failed to save PGP keys to localStorage:', error);
  }
}

/**
 * Get wallet info from cookies
 */
export function getWalletFromCookies(): StoredWalletInfo | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  const walletCookie = cookies.find(cookie => cookie.trim().startsWith(`${WALLET_COOKIE_NAME}=`));
  
  if (!walletCookie) {
    console.log('🔍 [Auth] No wallet cookie found');
    return null;
  }
  
  try {
    const walletData = decodeURIComponent(walletCookie.split('=')[1]);
    const wallet = JSON.parse(walletData) as WalletInfo;
    
    console.log('🔍 [Auth] Loaded wallet from cookies:');
    console.log('   Address:', wallet.address);
    console.log('   Email:', wallet.email);
    console.log('   Has mnemonic:', !!wallet.mnemonic);
  console.log('   Has private key:', !!wallet.privateKey);
  console.log('   Private key length:', wallet.privateKey?.length || 0);
    
    // Sync wallet secrets with localStorage and recover if cookie data is truncated
    if (typeof window !== 'undefined') {
      const storageKey = `${WALLET_STORAGE_PREFIX}${wallet.address}`;
      try {
        const storedWalletData = localStorage.getItem(storageKey);
        if (storedWalletData) {
          const stored = JSON.parse(storedWalletData) as Partial<WalletInfo>;
          if ((!wallet.privateKey || wallet.privateKey.length === 0) && stored.privateKey) {
            console.log('✅ [Auth] Restored private key from localStorage backup');
            wallet.privateKey = stored.privateKey;
          }
          if (!wallet.mnemonic && stored.mnemonic) {
            wallet.mnemonic = stored.mnemonic;
          }
          if (!wallet.publicKey && stored.publicKey) {
            wallet.publicKey = stored.publicKey;
          }
        } else if (wallet.privateKey) {
          // Ensure localStorage backup exists for future sessions
          const payload = JSON.stringify({
            privateKey: wallet.privateKey,
            mnemonic: wallet.mnemonic,
            publicKey: wallet.publicKey,
            email: wallet.email,
          });
          localStorage.setItem(storageKey, payload);
          console.log('✅ [Auth] Created new wallet backup in localStorage');
        }
      } catch (error) {
        console.error('❌ [Auth] Failed to sync wallet with localStorage:', error);
      }
    }
    
    // Get PGP keys from localStorage using wallet-specific key
    console.log('🔍 [Auth] Checking for PGP keys in localStorage...');
    
    try {
      // Use wallet-specific key (same as login page)
      const storageKey = `${PGP_KEYS_STORAGE_PREFIX}${wallet.address}`;
      const pgpData = localStorage.getItem(storageKey);
      
      if (pgpData) {
        const pgpKeys = JSON.parse(pgpData);
        console.log('✅ [Auth] PGP keys found in localStorage');
        console.log('   Public key length:', pgpKeys.publicKey?.length || 0);
        console.log('   Private key length:', pgpKeys.privateKey?.length || 0);
        return {
          ...wallet,
          pgpPrivateKey: pgpKeys.privateKey,
          pgpPublicKey: pgpKeys.publicKey,
        };
      } else {
        console.log('⚠️ [Auth] No PGP keys found in localStorage for address:', wallet.address);
      }
    } catch (error) {
      console.error('❌ [Auth] Failed to load PGP keys from localStorage:', error);
    }
    
    console.log('⚠️ [Auth] No PGP keys found in cookies');
    return wallet;
  } catch (error) {
    console.error('❌ [Auth] Failed to parse wallet cookie:', error);
    return null;
  }
}

/**
 * Check if user is logged in
 */
export function isLoggedIn(): boolean {
  return getWalletFromCookies() !== null;
}

/**
 * Logout user (clear cookies and localStorage)
 */
export function logout(): void {
  const wallet = getWalletFromCookies();
  // Set cookies to expire in the past
  document.cookie = `${WALLET_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  
  if (typeof window !== 'undefined') {
    try {
      if (wallet?.address) {
        const pgpKey = `${PGP_KEYS_STORAGE_PREFIX}${wallet.address}`;
        const walletKey = `${WALLET_STORAGE_PREFIX}${wallet.address}`;
        localStorage.removeItem(pgpKey);
        localStorage.removeItem(walletKey);
        console.log('✅ [Auth] Removed wallet data from localStorage');
      } else {
        // Fallback: remove any entries that match our prefixes
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (key.startsWith(PGP_KEYS_STORAGE_PREFIX) || key.startsWith(WALLET_STORAGE_PREFIX)) {
            localStorage.removeItem(key);
          }
        }
        console.log('✅ [Auth] Cleared residual ChainMail localStorage entries');
      }
    } catch (error) {
      console.error('❌ [Auth] Failed to clear localStorage:', error);
    }
  }
  console.log('✅ [Auth] Logged out - cleared wallet cookie and PGP keys');
}

/**
 * Redirect to login if not authenticated
 */
export function redirectToLoginIfNotAuthenticated(): void {
  if (typeof window !== 'undefined' && !isLoggedIn()) {
    window.location.href = '/login';
  }
}

/**
 * Redirect to home if already authenticated
 */
export function redirectToHomeIfAuthenticated(): void {
  if (typeof window !== 'undefined' && isLoggedIn()) {
    window.location.href = '/';
  }
}
