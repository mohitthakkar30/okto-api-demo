import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

export async function POST(request: NextRequest) {
  try {
    const { credential } = await request.json();

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    // console.log('Google auth payload:', credential);
    
    
    if (!payload) {
      throw new Error('Invalid token payload');
    }

    // Extract user information
    const userInfo = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      email_verified: payload.email_verified,
      // token_id: payload.token_id, // Unique token identifier
    };

    return NextResponse.json({ 
      success: true, 
      user: userInfo,
      token: credential 
    });

  } catch (error: any) {
    console.error('Google auth error:', error);
    return NextResponse.json(
      { error: error.message }, 
      { status: 400 }
    );
  }
}