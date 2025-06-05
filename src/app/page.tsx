'use client';

import { useState, useEffect } from 'react';
import { SessionKey } from '@/utils/sessionKey';

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

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);

  useEffect(() => {
    // Initialize Google Sign-In
    if (typeof window !== 'undefined' && window.google) {
      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
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
  }, []);

  const handleGoogleSignIn = async (response: any) => {
    try {
      setLoading(true);
      setError(null);
     
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
      console.log("Google Token:", data.token);
      
      console.log('Google Sign-In successful:', data.user);

    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOktoAuthenticate = async () => {
    if (!googleUser) {
      setError('Please sign in with Google first');
      return;
    }

    setLoading(true);
    setError(null);
    
    const OKTO_SWA = process.env.NEXT_PUBLIC_OKTO_SWA;
    const OKTO_PRIVATE_KEY = process.env.NEXT_PUBLIC_OKTO_PRIVATE_KEY;
    
    try {
      const session = SessionKey.create(); 
      console.log("=== SESSION KEY DEBUG ===");
      // console.log("Session Key:", session);
      
      // console.log("Private key:", session.privateKeyHexWith0x);
      // console.log("Public key:", session.uncompressedPublicKeyHexWith0x);
      // console.log("Ethereum address:", session.ethereumAddress);
      // console.log("Address length:", session.ethereumAddress?.length);
      console.log("=========================");
      const provider = 'google';
      const idToken = googleToken;
      // console.log('Session Key:', session);
      const extra_params = {
        idToken,
        provider

      }
      
      const authPayload = {
        extra_params,
        // session: session,
        // clientSWA: OKTO_SWA,
        // clientPrivateKey: OKTO_PRIVATE_KEY,
        
      };

      const response = await fetch('/api/okto-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authPayload),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }
      
      setResult(data);
    } catch (error: any) {
      console.error('Okto authentication error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    setGoogleUser(null);
    setGoogleToken(null);
    setResult(null);
    setError(null);
    if (window.google) {
      window.google.accounts.id.disableAutoSelect();
    }
  };

  return (
    <main className="container mx-auto py-8 px-4 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8 text-center">Google Sign-In + Okto Authentication</h1>
      
      {!googleUser ? (
        <div className="text-center space-y-4">
          <p className="text-gray-600 mb-6">Please sign in with Google to continue:</p>
          <div id="google-signin-button" className="flex justify-center"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Google User Info */}
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <h2 className="text-lg font-semibold text-green-800 mb-2">✅ Google Sign-In Successful</h2>
            <div className="flex items-center space-x-4">
              <img 
                src={googleUser.picture} 
                alt={googleUser.name}
                className="w-12 h-12 rounded-full"
              />
              <div>
                <p className="font-medium">{googleUser.name}</p>
                <p className="text-sm text-gray-600">{googleUser.email}</p>
              </div>
            </div>
            <button 
              onClick={handleSignOut}
              className="mt-3 text-sm text-red-600 hover:text-red-800"
            >
              Sign Out
            </button>
          </div>

          {/* Okto Authentication */}
          <div className="text-center">
            <button 
              onClick={handleOktoAuthenticate} 
              disabled={loading}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg disabled:opacity-50 hover:bg-blue-600 transition-colors"
            >
              {loading ? 'Authenticating with Okto...' : 'Authenticate with Okto'}
            </button>
          </div>
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {result && (
        <div className="mt-6">
          <h3 className="font-bold text-lg mb-2">🎉 Okto Authentication Result:</h3>
          <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}