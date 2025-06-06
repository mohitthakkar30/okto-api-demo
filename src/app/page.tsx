'use client';

import { useState, useEffect } from 'react';
import {LocalAuthOptions} from '@google-cloud/local-auth';

declare global {
  interface Window {
    google: any;
  }
}

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  email_verified: boolean;
}

interface OktoUser {
  email: string;
  user_id: string;
  created_at: string;
  freezed: boolean;
}

export default function OktoDemo() {
  const [activeTab, setActiveTab] = useState('google');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Google Auth State
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [emailUserToken, setEmailUserToken] = useState();
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleOktoResult, setGoogleOktoResult] = useState<any>(null);
  
  // Email OTP State
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [emailOktoResult, setEmailOktoResult] = useState<any>(null);
  
  // Token Transfer State
  const [recipientAddress, setRecipientAddress] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [networkName, setNetworkName] = useState<keyof typeof networkToCaip2>('BASE');
  const [transferResult, setTransferResult] = useState<any>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [emailToken, setEmailToken] = useState(''); // For email OTP authentication
  const [sessionConfig, setSessionConfig] = useState(null);

  const networkToCaip2 = { 
    'BASE': 'eip155:8453',
  };

  useEffect(() => {
    console.log('Auth State Debug:', {
      authToken: authToken ? 'EXISTS' : 'NULL',
      authTokenLength: authToken ? authToken.length : 0,
      sessionConfig: sessionConfig ? 'EXISTS' : 'NULL',
      localStorage: {
        authToken: localStorage.getItem('authToken') ? 'EXISTS' : 'NULL',
        sessionConfig: localStorage.getItem('sessionConfig') ? 'EXISTS' : 'NULL'
      }
    });
  }, [authToken, sessionConfig]);

  const handleTokenTransfer = async () => {
    if (!authToken) {
      setError('Please authenticate first');
      return;
    }
  
    if (!recipientAddress || !tokenAddress || !amount) {
      setError('Please fill in all transfer fields');
      return;
    }
  
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount < 0) {
      setError('Amount must be a positive number');
      return;
    }
  
    if (!sessionConfig) {
      setError('Session configuration not found. Please re-authenticate.');
      return;
    }
  
    setLoading(true);
    clearErrors();
  
    try {
      const caip2Id = networkToCaip2[networkName];
      if (!caip2Id) {
        throw new Error(`Unsupported network: ${networkName}`);
      }
  
      const transferPayload = {
        caip2Id: caip2Id,
        recipient: recipientAddress,
        token: tokenAddress,
        amount: numericAmount,
        sessionConfig: sessionConfig,
      };
      // console.log("Transfer Payload:", transferPayload);
      
      const response = await fetch('/api/transfer-token-intent', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transferPayload),
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.error || 'Transfer failed');
      }
  
      setTransferResult(data);
    } catch (error: any) {
      console.error('Transfer error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    // Initialize Google Sign-In
    if (typeof window !== 'undefined' && window.google) {
      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'your-google-client-id',
        callback: handleGoogleSignIn,
      });

      window.google.accounts.id.renderButton(
        document.getElementById('google-signin-button'),
        {
          theme: 'outline',
          size: 'large',
          width: 300,
        }
      );
    }
  }, [activeTab]);

  const clearErrors = () => setError(null);

  // Google Authentication Functions
  const handleGoogleSignIn = async (response: any) => {
    try {
      setLoading(true);
      clearErrors();
     
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Google authentication failed');
      }

      setGoogleUser(data.user);
      setGoogleToken(data.token);
      // setAuthToken(data.token);
      const buttonElement = document.getElementById('google-signin-button');
      if (buttonElement) {
        buttonElement.innerHTML = '';
      }
      
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOktoGoogleAuth = async () => {

    console.log("emailUserToken:", emailUserToken); 
    
    if (!googleUser && !googleToken && !emailUserToken) {
      setError('Please sign in first');
      return;
    }

    setLoading(true);
    clearErrors();
    
    try {

      const authPayload = {
        extra_params: {
          idToken: googleToken,
          provider: 'google'
        }
      };

      if (emailUserToken) {
        authPayload.extra_params.idToken = emailUserToken; 
        authPayload.extra_params.provider = 'okto'; 
      }
      console.log('Okto email payload:', authPayload);
      
      const response = await fetch('/api/okto-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authPayload),
      });

      const data = await response.json();
      // console.log('Okto authentication response:', data.authToken);
      // console.log("Data:", data);
      
      if (data.sessionConfig) {
        setSessionConfig(data.sessionConfig);
        localStorage.setItem('sessionConfig', JSON.stringify(data.sessionConfig));
      }
      
      localStorage.setItem('authToken', data.authToken); // Store auth token in local storage
      
      if (!response.ok) {
        throw new Error(data.error || 'Okto authentication failed');
      }
      
      setGoogleOktoResult(data);
      setAuthToken(data.authToken);
      
      // Fetch wallets after successful authentication
      if (data.authToken) {
        // fetchWallets(data.authToken);
      }
    } catch (error: any) {
      console.error('Okto authentication error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignOut = () => {
    setGoogleUser(null);
    setGoogleToken(null);
    setGoogleOktoResult(null);
    setAuthToken(null);
    setWallets([]);
    clearErrors();
    if (window.google) {
      window.google.accounts.id.disableAutoSelect();
    }
  };

  // Email OTP Functions
  const sendEmailOtp = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    clearErrors();

    try {
      const response = await fetch('/api/auth/email/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      setEmailToken(data.token); // Store the email token for verification
      // console.log('Email token:', data.token);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      setIsOtpSent(true);
      // console.log('OTP sent successfully');
    } catch (error: any) {
      console.error('Send OTP error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyEmailOtp = async () => {
    if (!email || !otp) {
      setError('Please enter both email and OTP');
      return;
    }

    setLoading(true);
    clearErrors();

    try {
      const response = await fetch('/api/auth/email/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp , emailToken}),
      });

      const data = await response.json();
      console.log('Email OTP verification response:', data);
      setEmailUserToken(data.auth_token); // Store the email user info

      
      localStorage.setItem('authToken', data.auth_token); 

      if (!response.ok) {
        throw new Error(data.error || 'OTP verification failed');
      }

      setEmailOktoResult(data);
      setAuthToken(data.auth_token);
      if (data.sessionConfig) {
        setSessionConfig(data.sessionConfig);
        localStorage.setItem('sessionConfig', JSON.stringify(data.sessionConfig));
      }
      // Fetch wallets after successful authentication
      if (data.authToken) {
        // fetchWallets(data.authToken);
      }
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetEmailOtp = () => {
    // setEmail('');
    // setOtp('');
    setIsOtpSent(false);
    // setEmailOktoResult(null);
    clearErrors();
  };

  // Wallet and Transfer Functions
  const fetchWallets = async (token: string) => {
    try {
      const response = await fetch('/api/get-wallets', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        setWallets(data.wallets || []);
      }
    } catch (error) {
      console.error('Failed to fetch wallets:', error);
    }
  };

  // const handleTokenTransfer = async () => {
  //   if (!authToken) {
  //     setError('Please authenticate first');
  //     return;
  //   }

  //   if (!recipientAddress || !tokenAddress || !amount) {
  //     setError('Please fill in all transfer fields');
  //     return;
  //   }

  //   setLoading(true);
  //   clearErrors();

  //   try {
  //     const transferPayload = {
  //       network_name: networkName,
  //       token_address: tokenAddress,
  //       recipient_address: recipientAddress,
  //       quantity: amount,
  //     };

  //     const response = await fetch('/api/transfer-token-intent', {
  //       method: 'POST',
  //       headers: {
  //         'Authorization': `Bearer ${authToken}`,
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify(transferPayload),
  //     });

  //     const data = await response.json();

  //     if (!response.ok) {
  //       throw new Error(data.error || 'Transfer failed');
  //     }

  //     setTransferResult(data);
  //   } catch (error: any) {
  //     console.error('Transfer error:', error);
  //     setError(error.message);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const tabs = [
    { id: 'google', label: 'Google Login' },
    { id: 'email', label: 'Email OTP' },
    { id: 'transfer', label: 'Token Transfer' }
  ];

  useEffect(() => {
    const storedSessionConfig = localStorage.getItem('sessionConfig');
    if (storedSessionConfig) {
      setSessionConfig(JSON.parse(storedSessionConfig));
    }
  }, []);

  return (
    <div className="min-h-screen bg-black py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-4xl font-bold text-center mb-8 text-white">
          Okto Demo Platform
        </h1>
        
        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-white rounded-lg shadow-sm border overflow-hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  clearErrors();
                }}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Google Login Tab */}
        {activeTab === 'google' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-black mb-6 text-center">Google Authentication</h2>
            
            {!googleUser ? (
              <div className="text-center space-y-6">
                <p className="text-gray-600">Sign in with your Google account to get started:</p>
                <div id="google-signin-button" className="flex justify-center"></div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                  <h3 className="text-lg font-semibold text-green-800 mb-3">✅ Google Sign-In Successful</h3>
                  <div className="flex items-center space-x-4 mb-4">
                    <img 
                      src={googleUser.picture} 
                      alt={googleUser.name}
                      className="w-16 h-16 rounded-full border-2 border-green-200"
                    />
                    <div>
                      <p className="font-medium text-black text-lg">{googleUser.name}</p>
                      <p className="text-black">{googleUser.email}</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleGoogleSignOut}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Sign Out
                  </button>
                </div>

                <div className="text-center">
                  <button 
                    onClick={handleOktoGoogleAuth} 
                    disabled={loading}
                    className="bg-blue-500 text-white px-8 py-3 rounded-lg disabled:opacity-50 hover:bg-blue-600 transition-colors text-lg font-medium"
                  >
                    {loading ? 'Authenticating Okto...' : 'Authenticate Okto'}
                  </button>
                </div>

                {googleOktoResult && (
                  <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                    <h3 className="font-bold text-lg mb-3 text-yellow-800">🎉 Okto Authentication Result:</h3>
                    <pre className="bg-white p-4 text-black rounded border overflow-auto text-sm max-h-64">
                      {JSON.stringify(googleOktoResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Email OTP Tab */}
        {activeTab === 'email' && (
          <div className="bg-black rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Email OTP Authentication</h2>
            
            {!emailOktoResult ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="w-full bg-white text-black px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isOtpSent}
                    />
                  </div>

                  {!isOtpSent ? (
                    <button
                      onClick={sendEmailOtp}
                      disabled={loading || !email}
                      className="w-full bg-blue-500 text-white py-3 rounded-lg disabled:opacity-50 hover:bg-blue-600 transition-colors font-medium"
                    >
                      {loading ? 'Sending OTP...' : 'Send OTP'}
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <p className="text-blue-800">📧 OTP sent to {email}</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          Enter OTP
                        </label>
                        <input
                          type="text"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          placeholder="Enter 6-digit OTP"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          maxLength={6}
                        />
                      </div>

                      <div className="flex space-x-4">
                        <button
                          onClick={verifyEmailOtp}
                          disabled={loading || !otp}
                          className="flex-1 bg-green-500 text-white py-3 rounded-lg disabled:opacity-50 hover:bg-green-600 transition-colors font-medium"
                        >
                          {loading ? 'Verifying...' : 'Verify OTP'}
                        </button>
                        
                        <button
                          onClick={resetEmailOtp}
                          className="flex-1 bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600 transition-colors font-medium"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                  <h3 className="text-lg font-semibold text-green-800 mb-3">✅ Email OTP Verification Successful</h3>
                  <p className="text-green-700">Authenticated with: {email}</p>
                  <button 
                    onClick={resetEmailOtp}
                    className="mt-3 text-sm text-red-600 hover:text-red-800"
                  >
                    Sign Out
                  </button>
                </div>
                <div className="text-center">
                  <button 
                    onClick={handleOktoGoogleAuth} 
                    disabled={loading}
                    className="bg-blue-500 text-white px-8 py-3 rounded-lg disabled:opacity-50 hover:bg-blue-600 transition-colors text-lg font-medium"
                  >
                    {loading ? 'Authenticating Okto...' : 'Authenticate Okto'}
                  </button>
                </div>

                <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                  <h3 className="font-bold text-lg mb-3 text-yellow-800">🎉 Okto Authentication Result:</h3>
                  <pre className="bg-black p-4 rounded border overflow-auto text-sm max-h-64">
                    {JSON.stringify(emailOktoResult, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Token Transfer Tab */}
        {activeTab === 'transfer' && (
  <div className="bg-black rounded-lg shadow-lg p-8">
    <h2 className="text-2xl text-white font-bold mb-6 text-center">Token Transfer (Intent-based)</h2>
    
    {!authToken ? (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">Please authenticate first using Google or Email OTP</p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={() => setActiveTab('google')}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Google Login
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors"
          >
            Email OTP
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-6">
        {/* Session Status Indicator */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-800 font-medium">Authentication Status</p>
              <p className="text-blue-600 text-sm">
                {sessionConfig ? `Connected...` : 'Session configuration missing'}
              </p>
            </div>
            {!sessionConfig && (
              <div className="text-yellow-600 text-sm">
                ⚠️ Please re-authenticate to enable transfers
              </div>
            )}
          </div>
        </div>

        {/* Wallets Display */}
        {wallets.length > 0 && (
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="font-bold text-lg mb-3">Your Wallets:</h3>
            <div className="space-y-2">
              {wallets.map((wallet, index) => (
                <div key={index} className="bg-white p-3 rounded border">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{wallet.network_name}</p>
                      <p className="text-sm text-gray-600 font-mono">{wallet.address}</p>
                    </div>
                    <button
                      onClick={() => setRecipientAddress(wallet.address)}
                      className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-gray-700"
                    >
                      Copy as Recipient
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transfer Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Network
            </label>
            <select
              value={networkName}
              onChange={(e) => setNetworkName(e.target.value as keyof typeof networkToCaip2)}
              className="w-full bg-white text-black px-4 py-3 border border-black rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="Base">Base (CAIP-2: eip155:8453)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Token Address
              <span className="text-xs text-white ml-2">(Contract address of the token to transfer)</span>
            </label>
            <input
              type="text"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              placeholder="0x... (e.g., USDC, USDT contract address)"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
            {/* Helper text for common tokens */}
            <div className="mt-2 text-xs text-gray-500">
              <p>Common testnet tokens:</p>
              <p>• Enter 0 for native token</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Recipient Address
              <span className="text-xs text-white ml-2">(Destination wallet address)</span>
            </label>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="0x... (recipient wallet address)"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Amount
              <span className="text-xs text-white ml-2">(In token units, e.g., 1.5 for 1.5 USDC)</span>
            </label>
            <input
              type="number"
              step="0.000001"

              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1.0"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Validation Messages */}
          {!sessionConfig && authToken && (
            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <p className="text-yellow-800 text-sm">
                ⚠️ Session configuration missing. Please re-authenticate to enable transfers.
              </p>
            </div>
          )}

          <button
            onClick={handleTokenTransfer}
            disabled={loading || !recipientAddress || !tokenAddress || !amount || !sessionConfig}
            className="w-full bg-purple-500 text-white py-3 rounded-lg disabled:opacity-50 hover:bg-purple-600 transition-colors font-medium disabled:cursor-not-allowed"
          >
            {loading ? 'Processing Transfer...' : 
             !sessionConfig ? 'Re-authenticate Required' : 
             'Transfer Tokens'}
          </button>

          {/* Transfer Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium text-gray-700 mb-2">Transfer Summary:</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <p>• Network: {networkName}</p>
              <p>• Token: {tokenAddress || 'Not specified'}</p>
              <p>• Recipient: {recipientAddress || 'Not specified'}</p>
              <p>• Amount: {amount || '0'}</p>
              <p>• CAIP-2 ID: {networkToCaip2[networkName] || 'Unknown'}</p>
            </div>
          </div>
        </div>

        {/* Transfer Result */}
        {transferResult && (
          <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
            <h3 className="font-bold text-lg mb-3 text-purple-800">🚀 Transfer Result:</h3>
            
            {/* Quick Status */}
            <div className="mb-4 p-3 bg-gray-500 rounded border">
              <div className="flex items-center justify-between">
                <span className="font-medium">Job ID:</span>
                <span className="font-mono text-sm">{transferResult.jobId}</span>
              </div>
              {transferResult.txnDetails && (
                <div className="flex items-center justify-between mt-2">
                  <span className="font-medium">Status:</span>
                  <span className="text-sm">{transferResult.txnDetails.status || 'Processing'}</span>
                </div>
              )}
            </div>

            {/* Full Response */}
            <details className="cursor-pointer">
              <summary className="font-medium text-purple-700 hover:text-purple-900">
                View Full Response
              </summary>
              <pre className="bg-gray-500 p-4 rounded border overflow-auto text-sm max-h-64 mt-2">
                {JSON.stringify(transferResult, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* Clear Results Button */}
        {transferResult && (
          <button
            onClick={() => setTransferResult(null)}
            className="w-full bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors text-sm"
          >
            Clear Results
          </button>
        )}
      </div>
    )}
  </div>
)}
        
      </div>
    </div>
  );
}