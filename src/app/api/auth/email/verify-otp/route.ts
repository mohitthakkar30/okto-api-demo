import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { generateClientSignature } from '../../../../../utils/generateClientSignature';
import type { Hex } from 'viem';

const clientSWA = process.env.NEXT_PUBLIC_OKTO_SWA as Hex;

async function postSignedRequest(endpoint: string, fullPayload: any) {
  const payloadWithTimestamp = {
    ...fullPayload,
    timestamp: Date.now() - 1000, // Adjust timestamp to avoid clock skew issues
  };

  const signature = await generateClientSignature(payloadWithTimestamp);

  const requestBody = {
    data: payloadWithTimestamp,
    client_signature: signature,
    type: "ethsign",
  };

  const response = await axios.post(endpoint, requestBody, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

export async function POST(request: NextRequest) {
  try {
    const { email, emailToken, otp } = await request.json();
    // console.log("Received request to verify OTP for email:", email);
    // console.log("emailToken:", emailToken);
    // console.log("OTP:", otp);
    
    if (!email || !emailToken || !otp) {
      return NextResponse.json(
        { error: 'Email, token, and OTP are required' }, 
        { status: 400 }
      );
    }

    const payload = {
      email: email,
      token: emailToken,
      otp: otp,
      client_swa: clientSWA,
    };

    // console.log("Verifying OTP...");
    const response = await postSignedRequest(
      "https://sandbox-api.okto.tech/api/oc/v1/authenticate/email/verify",
      payload
    );

    // console.log("OTP Verified:", response);

    return NextResponse.json({
      success: true,
      message: 'OTP verified successfully',
      auth_token: response.data.auth_token,
      refresh_auth_token: response.data.refresh_auth_token,
      device_token: response.data.device_token
    });

  } catch (error: any) {
    console.error("Error verifying OTP:", error);
    
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { error: error.response?.data?.message || 'Failed to verify OTP' }, 
        { status: error.response?.status || 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'An unexpected error occurred' }, 
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' }, 
    { status: 405 }
  );
}