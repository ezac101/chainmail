'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Search, Plus, X, Send, Lock, Clock, User, LogOut, Inbox, MailOpen, Shield, AlertCircle, Download, Copy, Check, Upload, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getWalletFromCookies, logout, redirectToLoginIfNotAuthenticated, StoredWalletInfo } from '@/lib/auth';
import { EmailService } from '@/services/email.service';

interface Email {
  id: string;
  sender: string;
  subject: string;
  timestamp: string;
  preview: string;
  isRead: boolean;
}

export default function InboxScreen() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState('');
  const [currentWallet, setCurrentWallet] = useState<ReturnType<typeof getWalletFromCookies>>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [emails, setEmails] = useState<Email[]>([]);
  const [sentEmails, setSentEmails] = useState<Email[]>([]);
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent'>('inbox');
  
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  
  // Compose form state
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  
  // Public key registration state
  const [publicKeyRegistered, setPublicKeyRegistered] = useState<boolean | null>(null);
  const [registeringPublicKey, setRegisteringPublicKey] = useState(false);
  
  // Key management state
  const [showKeyManagement, setShowKeyManagement] = useState(false);
  const [exportedKeys, setExportedKeys] = useState('');
  const [importKeys, setImportKeys] = useState('');
  const [keysCopied, setKeysCopied] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Loading state for reload
  const [isReloading, setIsReloading] = useState(false);

  // Check authentication and load wallet
  useEffect(() => {
    redirectToLoginIfNotAuthenticated();
    
    const wallet = getWalletFromCookies();
    if (wallet) {
      console.log('🔍 [Dashboard] Loaded wallet from cookies:');
      console.log('   Address:', wallet.address);
      console.log('   Email:', wallet.email);
      console.log('   Has PGP keys:', !!wallet.pgpPublicKey);
      console.log('   Has PGP private key:', !!wallet.pgpPrivateKey);
      
      setCurrentWallet(wallet);
      setCurrentUser(wallet.email);
      
      // Check if public key is registered on blockchain
      checkPublicKeyRegistration(wallet.address);
      
      // Load emails from blockchain based on active tab
      // Pass wallet directly to avoid async state issues
      loadEmails(wallet.address, wallet);
      loadSentEmails(wallet.address, wallet);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const checkPublicKeyRegistration = async (address: string) => {
    try {
      const { BlockchainService } = await import('@/services/blockchain.service');
      const publicKey = await BlockchainService.getPublicKey(address);
      setPublicKeyRegistered(!!(publicKey && publicKey.length > 0));
    } catch (error) {
      console.error('Error checking public key registration:', error);
      setPublicKeyRegistered(false);
    }
  };
  
  const handleRegisterPublicKey = async () => {
    if (!currentWallet?.pgpPublicKey || !currentWallet?.address) {
      alert('Missing wallet or PGP keys. Please login again.');
      return;
    }
    
    setRegisteringPublicKey(true);
    
    try {
      console.log('📡 [Dashboard] Registering public key via relay wallet...');
      const { BlockchainService } = await import('@/services/blockchain.service');
      await BlockchainService.registerPublicKeyRelay(
        currentWallet.pgpPublicKey,
        currentWallet.address
      );
      setPublicKeyRegistered(true);
      console.log('✅ [Dashboard] Public key registered successfully via relay!');
      alert('Public key registered successfully! You can now receive emails.');
    } catch (error) {
      console.error('❌ [Dashboard] Error registering public key:', error);
      alert('Failed to register public key. Please try again.');
    } finally {
      setRegisteringPublicKey(false);
    }
  };

  const loadEmails = async (address: string, wallet?: StoredWalletInfo) => {
    try {
      console.log('📬 [Dashboard] Loading emails for:', address);
      
      // Use passed wallet or current wallet state
      let walletToUse = wallet || currentWallet;
      console.log('📬 [Dashboard] Wallet availability check:', {
        hasWallet: !!walletToUse,
        hasPgpPrivateKey: !!walletToUse?.pgpPrivateKey,
        pgpPrivateKeyLength: walletToUse?.pgpPrivateKey?.length || 0,
        hasPrivateKey: !!walletToUse?.privateKey,
        privateKeyLength: walletToUse?.privateKey?.length || 0,
      });

      if ((!walletToUse?.pgpPrivateKey || !walletToUse?.privateKey) && typeof window !== 'undefined') {
        console.log('⚠️ [Dashboard] Missing keys, attempting to refresh from storage...');
        const refreshed = getWalletFromCookies();
        if (refreshed?.pgpPrivateKey && refreshed?.privateKey) {
          walletToUse = refreshed;
          setCurrentWallet(refreshed);
          console.log('✅ [Dashboard] Successfully refreshed wallet keys from storage');
        }
      }
      
      if (!walletToUse?.pgpPrivateKey || !walletToUse?.privateKey) {
        console.log('⚠️ [Dashboard] No PGP keys available, cannot decrypt emails');
        console.log('   Has pgpPrivateKey:', !!walletToUse?.pgpPrivateKey);
        console.log('   Has privateKey:', !!walletToUse?.privateKey);
        return;
      }
      
      // Fetch email IDs from blockchain
      console.log('📬 [Dashboard] Fetching email IDs from blockchain...');
      const emailIds = await EmailService.getRecipientEmails(address);
      console.log('📬 [Dashboard] Found', emailIds.length, 'emails');
      
      if (emailIds.length === 0) {
        setEmails([]);
        return;
      }
      
      // Fetch and decrypt each email
      const loadedEmails: Email[] = [];
      for (let i = 0; i < emailIds.length; i++) {
        try {
          console.log(`📬 [Dashboard] Loading email ${i + 1}/${emailIds.length} (ID: ${emailIds[i].emailId})...`);
          
          const decryptedEmail = await EmailService.fetchAndDecryptEmail(
            emailIds[i].emailId,
            walletToUse.pgpPrivateKey!,
            walletToUse.privateKey
          );
          
          // Format timestamp
          const date = new Date(decryptedEmail.timestamp * 1000);
          const formattedDate = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          });
          
          loadedEmails.push({
            id: emailIds[i].emailId.toString(),
            sender: decryptedEmail.from + '@blockdag.mailchain',
            subject: decryptedEmail.subject,
            timestamp: formattedDate,
            preview: decryptedEmail.body.substring(0, 100) + (decryptedEmail.body.length > 100 ? '...' : ''),
            isRead: false
          });
          
          console.log(`✅ [Dashboard] Email ${i + 1} loaded successfully`);
        } catch (error) {
          console.error(`❌ [Dashboard] Failed to load email ${emailIds[i].emailId}:`, error);
          // Continue loading other emails
        }
      }
      
      console.log('✅ [Dashboard] All emails loaded:', loadedEmails.length);
      setEmails(loadedEmails);
      
    } catch (error) {
      console.error('❌ [Dashboard] Error loading emails:', error);
      setEmails([]);
    }
  };

  const loadSentEmails = async (address: string, wallet?: StoredWalletInfo) => {
    try {
      console.log('📤 [Dashboard] Loading sent emails for:', address);
      
      // Use passed wallet or current wallet state
      let walletToUse = wallet || currentWallet;
      console.log('📤 [Dashboard] Wallet availability check (sent):', {
        hasWallet: !!walletToUse,
        hasPgpPrivateKey: !!walletToUse?.pgpPrivateKey,
        pgpPrivateKeyLength: walletToUse?.pgpPrivateKey?.length || 0,
        hasPrivateKey: !!walletToUse?.privateKey,
        privateKeyLength: walletToUse?.privateKey?.length || 0,
      });

      if ((!walletToUse?.pgpPrivateKey || !walletToUse?.privateKey) && typeof window !== 'undefined') {
        console.log('⚠️ [Dashboard] Missing keys for sent emails, refreshing from storage...');
        const refreshed = getWalletFromCookies();
        if (refreshed?.pgpPrivateKey && refreshed?.privateKey) {
          walletToUse = refreshed;
          setCurrentWallet(refreshed);
          console.log('✅ [Dashboard] Refreshed wallet keys for sent emails');
        }
      }
      
      if (!walletToUse?.pgpPrivateKey || !walletToUse?.privateKey) {
        console.log('⚠️ [Dashboard] No PGP keys available');
        console.log('   Has pgpPrivateKey:', !!walletToUse?.pgpPrivateKey);
        console.log('   Has privateKey:', !!walletToUse?.privateKey);
        return;
      }
      
      // Fetch sent email IDs from blockchain
      const { BlockchainService } = await import('@/services/blockchain.service');
      const emailIds = await BlockchainService.getSenderEmails(address);
      console.log('📤 [Dashboard] Found', emailIds.length, 'sent emails');
      
      if (emailIds.length === 0) {
        setSentEmails([]);
        return;
      }
      
      // Fetch each sent email
      const loadedEmails: Email[] = [];
      for (let i = 0; i < emailIds.length; i++) {
        try {
          const emailId = Number(emailIds[i]);
          console.log(`📤 [Dashboard] Loading sent email ${i + 1}/${emailIds.length} (ID: ${emailId})...`);
          
          // Get email metadata from blockchain
          const onChainEmail = await BlockchainService.getEmail(emailId);
          
          // For sent emails, we need to fetch from IPFS and decrypt
          // (We encrypted it with recipient's key, so we can't decrypt it)
          // Instead, we'll just show metadata
          const date = new Date(onChainEmail.timestamp * 1000);
          const formattedDate = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          });
          
          loadedEmails.push({
            id: emailId.toString(),
            sender: onChainEmail.sender + '@blockdag.mailchain',
            subject: 'Sent Email', // We can't decrypt it since it's encrypted with recipient's key
            timestamp: formattedDate,
            preview: `To: ${onChainEmail.recipient}@blockdag.mailchain`,
            isRead: true
          });
          
          console.log(`✅ [Dashboard] Sent email ${i + 1} loaded`);
        } catch (error) {
          console.error(`❌ [Dashboard] Failed to load sent email:`, error);
        }
      }
      
      console.log('✅ [Dashboard] All sent emails loaded:', loadedEmails.length);
      setSentEmails(loadedEmails);
      
    } catch (error) {
      console.error('❌ [Dashboard] Error loading sent emails:', error);
      setSentEmails([]);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // Use the correct email list based on active tab
  const currentEmails = activeTab === 'inbox' ? emails : sentEmails;

  const filteredEmails = currentEmails.filter(email => {
    const matchesSearch = email.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         email.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'all' || 
                         (activeFilter === 'unread' && !email.isRead) ||
                         (activeFilter === 'read' && email.isRead);
    return matchesSearch && matchesFilter;
  });

  const handleSendEmail = async () => {
    if (!currentWallet) {
      alert('Please login first');
      return;
    }

    setSending(true);
    
    try {
      // Extract recipient address from email format
      const recipientAddress = recipient.includes('@') ? recipient.split('@')[0] : recipient;
      
      console.log('📧 Sending email to:', recipientAddress);
      
      // Send email using EmailService (it will fetch recipient's public key automatically)
      const result = await EmailService.sendEmail(
        {
          to: recipientAddress,
          subject,
          body,
        },
        currentWallet.privateKey,
        currentWallet.pgpPrivateKey || '',
        currentWallet.address
      );
      
      console.log('✅ Email sent successfully:', result);
      
      // Reset form
      setRecipient('');
      setSubject('');
      setBody('');
      setShowCompose(false);
      
      alert('Email sent successfully!');
      
      // Reload emails with loading overlay
      setIsReloading(true);
      try {
        await loadEmails(currentWallet.address);
        await loadSentEmails(currentWallet.address);
      } finally {
        setIsReloading(false);
      }
    } catch (error) {
      console.error('❌ Error sending email:', error);
      alert(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  const handleViewEmail = (email: Email) => {
    setSelectedEmail(email);
    // Mark as read
    setEmails(emails.map(e => 
      e.id === email.id ? { ...e, isRead: true } : e
    ));
  };

  const handleExportKeys = () => {
    if (!currentWallet) return;
    
    const storageKey = `PGP_KEYS_${currentWallet.address}`;
    const keys = localStorage.getItem(storageKey);
    
    if (keys) {
      setExportedKeys(keys);
      setShowKeyManagement(true);
      console.log('✅ [Export] Keys exported successfully');
    } else {
      alert('❌ No keys found in localStorage for this wallet');
    }
  };

  const handleCopyKeys = async () => {
    try {
      await navigator.clipboard.writeText(exportedKeys);
      setKeysCopied(true);
      setTimeout(() => setKeysCopied(false), 2000);
      console.log('✅ [Export] Keys copied to clipboard');
    } catch (error) {
      console.error('❌ [Export] Failed to copy keys:', error);
      alert('Failed to copy keys to clipboard');
    }
  };

  const handleDownloadKeys = () => {
    if (!currentWallet) return;
    
    const blob = new Blob([exportedKeys], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chainmail-keys-${currentWallet.address.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('✅ [Export] Keys downloaded');
  };

  const handleImportKeys = () => {
    if (!currentWallet || !importKeys.trim()) {
      alert('Please paste your keys');
      return;
    }
    
    try {
      // Validate JSON
      const parsed = JSON.parse(importKeys);
      if (!parsed.privateKey || !parsed.publicKey) {
        throw new Error('Invalid keys format');
      }
      
      // Save to localStorage
      const storageKey = `PGP_KEYS_${currentWallet.address}`;
      localStorage.setItem(storageKey, importKeys);
      
      alert('✅ Keys imported successfully! Please refresh the page to use them.');
      console.log('✅ [Import] Keys imported and saved to localStorage');
      
      // Reload the page to use new keys
      window.location.reload();
    } catch (error) {
      console.error('❌ [Import] Failed to import keys:', error);
      alert('Failed to import keys. Please check the format.');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setUploadingFile(true);
    try {
      const text = await file.text();
      setImportKeys(text);
      console.log('✅ [Import] File uploaded successfully');
    } catch (error) {
      console.error('❌ [Import] Failed to read file:', error);
      alert('Failed to read file');
    } finally {
      setUploadingFile(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Loading Overlay */}
      {isReloading && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-background rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-foreground">Refreshing emails...</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-lg"></div>
                <div className="relative flex items-center justify-center w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-2xl shadow-lg">
                  <Mail className="w-5 h-5 text-primary-foreground" />
                </div>
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  ChainMail
                </h1>
                <p className="text-[10px] text-muted-foreground">
                  {activeTab === 'inbox' ? 'Inbox' : 'Sent'}
                </p>
              </div>
            </div>

            {/* User Info & Actions */}
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-xl"
                onClick={handleExportKeys}
                title="Backup/Restore Keys"
              >
                <Key className="w-4 h-4" />
              </Button>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-xl border border-primary/20">
                <User className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-primary font-medium font-mono">
                  {currentUser}
                </span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-xl hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setShowLogoutConfirm(true)}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-border bg-background sticky top-16 z-40">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-8">
          <div className="flex items-center gap-1">
            <Button
              onClick={() => setActiveTab('inbox')}
              variant={activeTab === 'inbox' ? 'ghost' : 'ghost'}
              className={`relative px-6 py-3 rounded-none transition-all duration-200 ${
                activeTab === 'inbox' 
                  ? 'text-primary font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Inbox className="w-4 h-4 mr-2" />
              Inbox
              {emails.length > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {emails.length}
                </span>
              )}
            </Button>
            
            <Button
              onClick={() => setActiveTab('sent')}
              variant={activeTab === 'sent' ? 'ghost' : 'ghost'}
              className={`relative px-6 py-3 rounded-none transition-all duration-200 ${
                activeTab === 'sent' 
                  ? 'text-primary font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Send className="w-4 h-4 mr-2" />
              Sent
              {sentEmails.length > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {sentEmails.length}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Public Key Registration Banner */}
      {publicKeyRegistered === false && (
        <div className="bg-yellow-50 border-b border-yellow-200">
          <div className="max-w-[1800px] mx-auto px-6 lg:px-8 py-3">
            <Alert className="bg-yellow-100 border-yellow-300">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="flex items-center justify-between">
                <span className="text-yellow-800 text-sm">
                  Your public key is not registered on the blockchain. You need to register it to receive emails.
                </span>
                <Button
                  onClick={handleRegisterPublicKey}
                  disabled={registeringPublicKey}
                  size="sm"
                  variant="default"
                  className="ml-4 bg-yellow-600 hover:bg-yellow-700"
                >
                  {registeringPublicKey ? 'Registering...' : 'Register Now'}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-16 z-30">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3 overflow-x-auto">
            {/* Compose Button */}
            <Button
              onClick={() => setShowCompose(true)}
              className="shadow-md rounded-xl hover:shadow-lg transition-all duration-300"
            >
              <Plus className="w-4 h-4 mr-2" />
              Compose
            </Button>

            <div className="h-8 w-px bg-border mx-2" />

            {/* Filters */}
            <Button
              onClick={() => setActiveFilter('all')}
              variant={activeFilter === 'all' ? 'secondary' : 'ghost'}
              className="rounded-xl transition-all duration-200"
            >
              <Mail className="w-4 h-4 mr-2" />
              All {activeTab === 'inbox' ? 'Inbox' : 'Sent'}
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {currentEmails.length}
              </span>
            </Button>
            
            <Button
              onClick={() => setActiveFilter('unread')}
              variant={activeFilter === 'unread' ? 'secondary' : 'ghost'}
              className="rounded-xl transition-all duration-200"
            >
              <MailOpen className="w-4 h-4 mr-2" />
              Unread
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {currentEmails.filter(e => !e.isRead).length}
              </span>
            </Button>
            
            <Button
              onClick={() => setActiveFilter('read')}
              variant={activeFilter === 'read' ? 'secondary' : 'ghost'}
              className="rounded-xl transition-all duration-200"
            >
              <Inbox className="w-4 h-4 mr-2" />
              Read
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {emails.filter(e => e.isRead).length}
              </span>
            </Button>
            
            <div className="h-8 w-px bg-border mx-2" />
            
            {/* Refresh Button */}
            <Button
              onClick={() => currentWallet && loadEmails(currentWallet.address)}
              variant="ghost"
              size="icon"
              className="rounded-xl"
              title="Refresh emails"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                <path d="M16 16h5v5"/>
              </svg>
            </Button>

            {/* Info Badge */}
            <div className="ml-auto hidden lg:flex items-center gap-2 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-xl">
              <Shield className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">End-to-End Encrypted</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-6 lg:px-8 py-6">
        {!selectedEmail ? (
          /* Email List */
          <Card className="shadow-xl rounded-3xl backdrop-blur-sm bg-background/95 h-[calc(100vh-13rem)] flex flex-col">
            {/* Search Bar */}
            <CardHeader className="pb-4 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 rounded-xl"
                />
              </div>
            </CardHeader>

            {/* Email List */}
            <CardContent className="p-0 flex-1 overflow-hidden">
              <div className="divide-y divide-border h-full overflow-y-auto">
                  {filteredEmails.length === 0 ? (
                    <div className="p-12 text-center h-full flex flex-col items-center justify-center">
                      <Mail className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                      <p className="text-muted-foreground text-sm">No emails found</p>
                    </div>
                  ) : (
                    filteredEmails.map((email) => (
                      <div
                        key={email.id}
                        onClick={() => handleViewEmail(email)}
                        className={`p-5 hover:bg-muted/50 cursor-pointer transition-all duration-300 ${
                          !email.isRead ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                              !email.isRead 
                                ? 'bg-primary/10 ring-2 ring-primary/20 shadow-sm' 
                                : 'bg-muted'
                            }`}>
                              <User className={`w-6 h-6 ${
                                !email.isRead ? 'text-primary' : 'text-muted-foreground'
                              }`} />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className={`text-sm truncate ${
                                !email.isRead 
                                  ? 'font-semibold text-foreground' 
                                  : 'font-medium text-muted-foreground'
                              }`}>
                                {email.sender}
                              </p>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="w-3.5 h-3.5" />
                                {email.timestamp}
                              </div>
                            </div>
                            <p className={`text-sm mb-1.5 ${
                              !email.isRead 
                                ? 'font-semibold text-foreground' 
                                : 'text-muted-foreground'
                            }`}>
                              {email.subject}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{email.preview}</p>
                          </div>
                          {!email.isRead && (
                            <div className="flex-shrink-0">
                              <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50"></div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Email View */
          <Card className="shadow-xl rounded-3xl backdrop-blur-sm bg-background/95 h-[calc(100vh-13rem)] flex flex-col">
            {/* Email Header with Back Button */}
            <CardHeader className="pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setSelectedEmail(null)}
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl hover:bg-muted transition-all duration-200"
                >
                  <X className="w-4 h-4" />
                </Button>
                <CardTitle className="text-xl line-clamp-1 flex-1">{selectedEmail.subject}</CardTitle>
              </div>
            </CardHeader>

            {/* Email Content */}
            <CardContent className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* Sender Info */}
              <div className="flex items-start gap-4 pb-6 border-b border-border">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center ring-2 ring-primary/20 shadow-sm">
                  <User className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground text-base">{selectedEmail.sender}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{selectedEmail.timestamp}</p>
                  </div>
                </div>
              </div>

              {/* Email Body */}
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="text-foreground whitespace-pre-wrap leading-relaxed text-base">{selectedEmail.preview}</p>
              </div>

              {/* Immutability Notice */}
              <Alert className="border-yellow-200 bg-yellow-50 rounded-2xl">
                <Lock className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  <p className="font-semibold text-sm mb-1">Immutable Email</p>
                  <p className="text-xs">
                    This email is stored permanently on the blockchain and cannot be deleted
                  </p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border-border rounded-3xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            {/* Modal Header */}
            <CardHeader className="space-y-1 pb-4 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Compose Email</CardTitle>
                <Button
                  onClick={() => setShowCompose(false)}
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl hover:bg-muted transition-all duration-200"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <CardDescription>
                Send an encrypted email on the blockchain
              </CardDescription>
            </CardHeader>

            {/* Modal Body */}
            <CardContent className="overflow-y-auto max-h-[calc(90vh-200px)] space-y-4 p-6">
              {/* Recipient */}
              <div className="space-y-2">
                <Label htmlFor="recipient" className="text-sm font-medium">
                  To (Wallet Address)
                </Label>
                <Input
                  id="recipient"
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x...@blockdag.mailchain"
                  className="font-mono text-sm rounded-xl h-10"
                />
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="subject" className="text-sm font-medium">
                  Subject
                </Label>
                <Input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter subject..."
                  className="rounded-xl h-10"
                />
              </div>

              {/* Body */}
              <div className="space-y-2">
                <Label htmlFor="message" className="text-sm font-medium">
                  Message
                </Label>
                <Textarea
                  id="message"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Type your message..."
                  rows={8}
                  className="resize-none rounded-xl"
                />
              </div>

              {/* Encryption Notice */}
              <Alert className="border-primary/20 bg-primary/5 rounded-2xl">
                <Lock className="h-4 w-4 text-primary" />
                <AlertDescription className="text-xs">
                  This email will be encrypted with the recipient&apos;s public key and stored immutably on BlockDAG
                </AlertDescription>
              </Alert>
            </CardContent>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/20">
              <Button
                onClick={() => setShowCompose(false)}
                variant="outline"
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={sending || !recipient || !subject || !body}
                className="rounded-xl shadow-lg"
              >
                <Send className="w-4 h-4 mr-2" />
                {sending ? 'Sending...' : 'Send Email'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <Card className="w-full max-w-md shadow-2xl border-border rounded-3xl animate-in zoom-in-95 duration-300">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Confirm Logout</CardTitle>
              <CardDescription>
                Are you sure you want to logout from ChainMail?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert className="border-yellow-200 bg-yellow-50 rounded-2xl">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800 text-xs">
                  Make sure you have saved your mnemonic phrase or private key. You&apos;ll need it to login again.
                </AlertDescription>
              </Alert>
            </CardContent>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/20">
              <Button
                onClick={() => setShowLogoutConfirm(false)}
                variant="outline"
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleLogout}
                variant="destructive"
                className="rounded-xl"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Key Management Modal */}
      {showKeyManagement && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <Card className="w-full max-w-2xl shadow-2xl border-border rounded-3xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-4 sticky top-0 bg-background z-10 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    Backup & Restore Keys
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Export your encryption keys to backup, or import previously backed up keys
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setShowKeyManagement(false)}
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6 p-6">
              {/* Warning */}
              <Alert className="border-red-200 bg-red-50 rounded-2xl">
                <Shield className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800 text-sm">
                  <strong>CRITICAL:</strong> Your encryption keys are required to read your emails. 
                  If you lose them, you CANNOT decrypt your emails. Save them securely!
                </AlertDescription>
              </Alert>

              {/* Export Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Export Keys (Backup)</h3>
                </div>
                
                {exportedKeys && (
                  <>
                    <Textarea
                      value={exportedKeys}
                      readOnly
                      className="font-mono text-xs min-h-[120px] rounded-2xl bg-muted"
                      placeholder="Your encryption keys will appear here..."
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleCopyKeys}
                        variant="outline"
                        className="flex-1 rounded-xl"
                      >
                        {keysCopied ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy to Clipboard
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleDownloadKeys}
                        variant="outline"
                        className="flex-1 rounded-xl"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download as File
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              {/* Import Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Import Keys (Restore)</h3>
                </div>
                
                {/* File Upload Option */}
                <div className="space-y-2">
                  <Label htmlFor="keyFile" className="text-xs text-muted-foreground">
                    Upload JSON file
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="keyFile"
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                      className="rounded-xl file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select the JSON file you previously downloaded
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or paste directly</span>
                  </div>
                </div>
                
                <Textarea
                  value={importKeys}
                  onChange={(e) => setImportKeys(e.target.value)}
                  className="font-mono text-xs min-h-[120px] rounded-2xl"
                  placeholder="Paste your backed up keys here..."
                />
                
                <Button
                  onClick={handleImportKeys}
                  disabled={!importKeys.trim()}
                  className="w-full rounded-xl"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import Keys
                </Button>
                
                <Alert className="border-blue-200 bg-blue-50 rounded-2xl">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 text-xs">
                    After importing keys, the page will automatically refresh to apply changes.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}