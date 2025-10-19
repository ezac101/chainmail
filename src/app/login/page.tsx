'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Key, Wallet, Download, Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WalletService } from '@/services/wallet.service';
import { EncryptionService } from '@/services/encryption.service';
import { BlockchainService } from '@/services/blockchain.service';
import { saveWalletToCookies, savePGPKeysToCookies, redirectToHomeIfAuthenticated } from '@/lib/auth';

interface GeneratedWallet {
  mnemonic: string;
  privateKey: string;
  address: string;
  email: string;
}

export default function LoginScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('login');
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [pgpKeysFile, setPgpKeysFile] = useState<File | null>(null);
  const [hasPgpKeysFile, setHasPgpKeysFile] = useState(false);
  const [uploadingPgpKeys, setUploadingPgpKeys] = useState(false);
  const [generatedWallet, setGeneratedWallet] = useState<GeneratedWallet | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    redirectToHomeIfAuthenticated();
  }, []);

  const handleLogin = async (walletInfo: ReturnType<typeof WalletService.generateWallet>) => {
    setLoading(true);
    try {
      console.log('🔐 [Login] Starting login process...');
      console.log('🔐 [Login] Wallet info received:');
      console.log('   Address:', walletInfo.address);
      console.log('   Email:', walletInfo.email);
      
      // Check if PGP keys already exist in localStorage for this address
      const storageKey = `PGP_KEYS_${walletInfo.address}`;
      const existingKeys = localStorage.getItem(storageKey);
      
      let privateKey: string;
      let publicKey: string;
      let shouldRegisterKey = false;
      
      // Check if a public key is already registered on the blockchain
      console.log('🔐 [Login] Checking blockchain for existing public key...');
      const blockchainPublicKey = await BlockchainService.getPublicKey(walletInfo.address);
      
      if (existingKeys) {
        console.log('🔐 [Login] Found existing PGP keys in localStorage');
        const parsed = JSON.parse(existingKeys);
        privateKey = parsed.privateKey;
        publicKey = parsed.publicKey;
        
        // Check if localStorage key matches blockchain key
        if (blockchainPublicKey && blockchainPublicKey.length > 0) {
          if (blockchainPublicKey === publicKey) {
            console.log('✅ [Login] Keys match blockchain registration');
          } else {
            console.warn('⚠️ [Login] WARNING: LocalStorage keys do not match blockchain!');
            console.warn('⚠️ [Login] This means you cannot decrypt old emails.');
            console.warn('⚠️ [Login] Using localStorage keys and will re-register on blockchain.');
            shouldRegisterKey = true;
          }
        } else {
          console.log('🔐 [Login] No key on blockchain yet, will register localStorage keys');
          shouldRegisterKey = true;
        }
      } else {
        // No keys in localStorage
        if (blockchainPublicKey && blockchainPublicKey.length > 0) {
          // Keys exist on blockchain but not in localStorage
          console.error('❌ [Login] CRITICAL: Public key exists on blockchain but not in localStorage!');
          console.error('❌ [Login] You have LOST your private key and cannot decrypt old emails.');
          console.error('❌ [Login] Generating NEW keys. Old emails will be UNREADABLE.');
          alert('⚠️ WARNING: Your encryption keys were lost. Old emails cannot be decrypted. New keys will be generated.');
        }
        
        console.log('🔐 [Login] Generating new PGP keys...');
        // Generate PGP keys for the wallet (note: this is NOT deterministic!)
        const keys = await EncryptionService.generateKeyPair(
          walletInfo.privateKey,
          walletInfo.address
        );
        privateKey = keys.privateKey;
        publicKey = keys.publicKey;
        
        console.log('✅ [Login] PGP keys generated (will be saved below)');
        shouldRegisterKey = true;
      }

      console.log('💾 [Login] Saving wallet info to cookies...');
      console.log('   Saving address:', walletInfo.address);
      console.log('   Saving email:', walletInfo.email);
      // Save wallet info and PGP keys to cookies
      saveWalletToCookies(walletInfo);
      savePGPKeysToCookies(privateKey, publicKey, walletInfo.address);
      console.log('✅ [Login] Saved to cookies');

      // Register public key on blockchain only if needed
      if (shouldRegisterKey) {
        console.log('📡 [Login] Registering public key on blockchain via relay...');
        try {
          await BlockchainService.registerPublicKeyRelay(publicKey, walletInfo.address);
          console.log('✅ [Login] Public key registered on blockchain');
        } catch (blockchainError) {
          // This is not critical - user can still use the app (key might already be registered)
          console.warn('⚠️ [Login] Failed to register public key on blockchain:', blockchainError);
          // Continue anyway
        }
      } else {
        console.log('✅ [Login] Public key already registered on blockchain, skipping registration');
      }

      console.log('✅ [Login] Login successful, redirecting to dashboard...');
      // Redirect to home page
      router.push('/');
    } catch (err) {
      console.error('❌ [Login] Login error:', err);
      setError('Failed to complete login. Please try again.');
      setLoading(false);
    }
  };

  const generateWallet = async () => {
    setLoading(true);
    setError('');
    
    try {
      const walletInfo = WalletService.generateWallet();
      
      setGeneratedWallet({
        mnemonic: walletInfo.mnemonic || '',
        privateKey: walletInfo.privateKey,
        address: walletInfo.address,
        email: walletInfo.email
      });
    } catch (err) {
      console.error('Error generating wallet:', err);
      setError('Failed to generate wallet. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loginWithMnemonic = async () => {
    setLoading(true);
    setError('');
    
    try {
      console.log('🔑 [Login] Restoring wallet from mnemonic...');
      const walletInfo = WalletService.fromMnemonic(mnemonicInput.trim());
      console.log('✅ [Login] Wallet restored:');
      console.log('   Address:', walletInfo.address);
      console.log('   Email:', walletInfo.email);
      console.log('   Has mnemonic:', !!walletInfo.mnemonic);
      console.log('   Private key length:', walletInfo.privateKey.length);
      
      // If user has PGP keys file, restore them
      if (hasPgpKeysFile && pgpKeysFile) {
        await restorePgpKeysFromFile(walletInfo);
      }
      
      await handleLogin(walletInfo);
    } catch (err) {
      console.error('❌ [Login] Error logging in with mnemonic:', err);
      setError('Invalid mnemonic phrase. Please check and try again.');
      setLoading(false);
    }
  };

  const restorePgpKeysFromFile = async (walletInfo: ReturnType<typeof WalletService.generateWallet>) => {
    if (!pgpKeysFile) return;
    
    try {
      console.log('� [Login] Restoring PGP keys from file...');
      const text = await pgpKeysFile.text();
      const parsed = JSON.parse(text.trim());
      
      if (!parsed.privateKey || !parsed.publicKey) {
        throw new Error('Invalid PGP keys file format. Expected JSON with privateKey and publicKey fields.');
      }
      
      // Validate that the keys are PGP format
      if (!parsed.privateKey.includes('-----BEGIN PGP PRIVATE KEY BLOCK-----')) {
        throw new Error('Invalid PGP private key format.');
      }
      
      // Save the restored keys to localStorage
      const storageKey = `PGP_KEYS_${walletInfo.address}`;
      localStorage.setItem(storageKey, JSON.stringify({
        privateKey: parsed.privateKey,
        publicKey: parsed.publicKey
      }));
      
      console.log('✅ [Login] PGP keys restored from file and saved to localStorage');
    } catch (err) {
      console.error('❌ [Login] Failed to restore PGP keys from file:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to restore PGP keys from file');
    }
  };

  const handlePgpKeysFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPgpKeysFile(null);
      return;
    }
    
    setUploadingPgpKeys(true);
    setError('');
    
    try {
      const text = await file.text();
      const parsed = JSON.parse(text.trim());
      
      if (!parsed.privateKey || !parsed.publicKey) {
        throw new Error('Invalid file format. Expected JSON with privateKey and publicKey fields.');
      }
      
      if (!parsed.privateKey.includes('-----BEGIN PGP PRIVATE KEY BLOCK-----')) {
        throw new Error('Invalid PGP private key format.');
      }
      
      setPgpKeysFile(file);
      console.log('✅ [Login] PGP keys file validated and loaded');
    } catch (error) {
      console.error('❌ [Login] Failed to read PGP keys file:', error);
      setError(error instanceof Error ? error.message : 'Failed to read file');
      setPgpKeysFile(null);
    } finally {
      setUploadingPgpKeys(false);
    }
  };

  const continueWithGeneratedWallet = async () => {
    if (!generatedWallet) return;
    
    setLoading(true);
    setError('');
    
    try {
      const walletInfo = WalletService.fromMnemonic(generatedWallet.mnemonic);
      await handleLogin(walletInfo);
    } catch (err) {
      console.error('Error logging in with generated wallet:', err);
      setError('Failed to proceed. Please try again.');
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMnemonic = () => {
    if (!generatedWallet) return;
    
    const element = document.createElement('a');
    const file = new Blob([generatedWallet.mnemonic], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'chainmail-wallet-backup.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center p-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo/Header - More Spacious */}
        <div className="text-center mb-8 space-y-3">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-3xl blur-2xl"></div>
              <div className="relative inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-3xl shadow-2xl transform hover:scale-105 transition-transform duration-300">
                <Mail className="w-7 h-7 text-primary-foreground" />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent">
              ChainMail
            </h1>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
              Anonymous, Immutable Email on BlockDAG
            </p>
          </div>
        </div>

        {/* Important Notice Banner */}
        <Alert className="mb-4 border-blue-200 bg-blue-50">
          <Key className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-xs">
            <strong>Important:</strong> After logging in, backup your encryption keys from the dashboard (Key icon). Without them, you cannot read your emails!
          </AlertDescription>
        </Alert>

        {/* Main Card - Reduced Size */}
        <Card className="border-border shadow-2xl backdrop-blur-sm bg-background/95">
          <CardHeader className="space-y-0 pb-0 pt-5">
            <CardTitle className="text-xl">Welcome Back</CardTitle>
            <CardDescription className="text-xs">
              Login with your existing wallet or create a new one
            </CardDescription>
          </CardHeader>
          
          <CardContent className="px-6 pb-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="login" className="text-sm">Login</TabsTrigger>
                <TabsTrigger value="generate" className="text-sm">Create Wallet</TabsTrigger>
              </TabsList>

              {/* Error Message */}
              {error && (
                <Alert variant="destructive" className="mb-3 py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              {/* Login Tab */}
              <TabsContent value="login" className="space-y-4 mt-0">
                {/* Mnemonic Input */}
                <div className="space-y-1.5">
                  <Label htmlFor="mnemonic" className="text-sm">Mnemonic Phrase</Label>
                  <Textarea
                    id="mnemonic"
                    value={mnemonicInput}
                    onChange={(e) => setMnemonicInput(e.target.value)}
                    placeholder="Enter your 12 or 24 word phrase..."
                    rows={3}
                    className="resize-none font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your 12 or 24 word recovery phrase
                  </p>
                </div>

                {/* PGP Keys Recovery Checkbox */}
                <div className="space-y-2">
                  <div className="flex items-start space-x-2">
                    <input
                      type="checkbox"
                      id="hasPgpKeys"
                      checked={hasPgpKeysFile}
                      onChange={(e) => {
                        setHasPgpKeysFile(e.target.checked);
                        if (!e.target.checked) {
                          setPgpKeysFile(null);
                        }
                      }}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div className="flex-1">
                      <Label htmlFor="hasPgpKeys" className="text-sm font-medium cursor-pointer">
                        I have my PGP encryption keys to recover my emails
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Upload a JSON file containing your privateKey and publicKey (starting with &quot;-----BEGIN PGP PRIVATE KEY BLOCK-----&quot;)
                      </p>
                    </div>
                  </div>

                  {/* PGP Keys File Upload - Show when checkbox is checked */}
                  {hasPgpKeysFile && (
                    <div className="space-y-2 pl-6">
                      <Label htmlFor="pgpKeysFile" className="text-sm">PGP Keys File (JSON)</Label>
                      <Input
                        id="pgpKeysFile"
                        type="file"
                        accept=".json,application/json"
                        onChange={handlePgpKeysFileUpload}
                        disabled={uploadingPgpKeys || loading}
                        className="rounded-xl file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                      />
                      <p className="text-xs text-muted-foreground">
                        Upload a JSON file with your PGP keys: {'{'}privateKey: &quot;-----BEGIN PGP PRIVATE KEY BLOCK-----...&quot;, publicKey: &quot;-----BEGIN PGP PUBLIC KEY BLOCK-----...&quot;{'}'}
                      </p>
                      {pgpKeysFile && (
                        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                          <Check className="w-3 h-3" />
                          <span>PGP keys file loaded: {pgpKeysFile.name}</span>
                        </div>
                      )}
                      {uploadingPgpKeys && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                          <span>Validating PGP keys...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Login Button */}
                <Button
                  onClick={loginWithMnemonic}
                  disabled={loading || !mnemonicInput.trim()}
                  className="w-full"
                >
                  <Key className="w-4 h-4 mr-2" />
                  {loading ? 'Logging in...' : 'Login with Mnemonic'}
                </Button>

                {/* Info Alert */}
                <Alert className="border-blue-200 bg-blue-50 rounded-xl">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 text-xs">
                    Login with your recovery phrase. If you have your PGP encryption keys backed up, check the box above to restore them and decrypt your old emails.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              {/* Generate Wallet Tab */}
              <TabsContent value="generate" className="space-y-3 mt-0">
                {!generatedWallet ? (
                  <div className="space-y-4">
                    <div className="text-center py-6 space-y-3">
                      <div className="flex justify-center">
                        <div className="rounded-full bg-primary/10 p-3">
                          <Wallet className="w-10 h-10 text-primary" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold">
                          Create New Wallet
                        </h3>
                        <p className="text-xs text-muted-foreground px-4">
                          Generate a new wallet for anonymous email. Save your mnemonic securely!
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={generateWallet}
                      disabled={loading}
                      className="w-full"
                    >
                      <Wallet className="w-4 h-4 mr-2" />
                      {loading ? 'Generating...' : 'Generate New Wallet'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Alert variant="default" className="border-yellow-200 bg-yellow-50 py-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-800 text-xs">
                        <strong>Important:</strong> Save your mnemonic phrase securely! You&apos;ll need it to access your wallet.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-1.5">
                      <Label className="text-sm">Your Email Address</Label>
                      <div className="flex gap-2">
                        <Input
                          value={generatedWallet.email}
                          readOnly
                          className="flex-1 font-mono text-xs bg-muted h-9"
                        />
                        <Button
                          onClick={() => copyToClipboard(generatedWallet.email)}
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                        >
                          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm">Mnemonic Phrase</Label>
                      <div className="bg-muted border rounded-lg p-3">
                        <p className="text-xs font-mono leading-relaxed break-all">
                          {generatedWallet.mnemonic}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => copyToClipboard(generatedWallet.mnemonic)}
                          variant="outline"
                          className="flex-1 h-9"
                          size="sm"
                        >
                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                          Copy
                        </Button>
                        <Button
                          onClick={downloadMnemonic}
                          variant="outline"
                          className="flex-1 h-9"
                          size="sm"
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          Download
                        </Button>
                      </div>
                    </div>

                    <Button
                      onClick={continueWithGeneratedWallet}
                      disabled={loading}
                      className="w-full"
                    >
                      {loading ? 'Logging in...' : 'Continue to ChainMail'}
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
          
          <CardFooter className="flex justify-center border-t pt-3 pb-4">
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              Powered by BlockDAG Testnet<br className="sm:hidden" />
              <span className="hidden sm:inline"> • </span>
              Immutable & Anonymous
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}