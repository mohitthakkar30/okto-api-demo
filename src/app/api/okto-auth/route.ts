import { NextRequest, NextResponse } from 'next/server';
import { invokeAuthenticate } from '../../../utils/okto-auth';
import { getAuthorizationToken } from '../../../utils/getAuthorizationToken';
import { v4 as uuidv4 } from "uuid";
import { generatePaymasterData } from '../../../utils/generatePaymasterData';
import { Constants } from '@/helper/constants';
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  toBytes,
  type Hash,
  type Hex,
} from "viem";
import { signMessage } from "viem/accounts";
import { SessionKey } from '@/utils/sessionKey';

const clientSWA = process.env.NEXT_PUBLIC_OKTO_SWA as Hex;
const clientPrivateKey = process.env.NEXT_PUBLIC_OKTO_PRIVATE_KEY as Hex; 

async function generateAuthPayload(
  authData: any,
  sessionKey: any,
  clientSWA: any,
  clientPriv: any
) {
  // STEP 1: Generate a unique UUID-based nonce
  const nonce = uuidv4();
  // STEP 2: Construct a UserOp authenticate payload
  const payload: any = {};
  payload.authData = authData;
  payload.sessionData = {};
  payload.sessionData.nonce = nonce;
  payload.sessionData.clientSWA = clientSWA;
  payload.sessionData.sessionPk = sessionKey.uncompressedPublicKeyHexWith0x;
  payload.sessionData.maxPriorityFeePerGas = "0xBA43B7400"; // constant on okto chain
  payload.sessionData.maxFeePerGas = "0xBA43B7400"; // constant on okto chain
  payload.sessionData.paymaster =
    Constants.ENV_CONFIG.SANDBOX.PAYMASTER_ADDRESS; // okto testnet paymaster address
  payload.sessionData.paymasterData = await generatePaymasterData(
    clientSWA,
    clientPriv,
    nonce,
    new Date(Date.now() + 6 * Constants.HOURS_IN_MS), // hours in milliseconds
    0
  );

  // STEP 3: Create a message, sign it and add signatures to the user op. The message is signed using the client's private key and session private key to symbolize both the user and client signatures
  const message = {
    raw: toBytes(
      keccak256(
        encodeAbiParameters(parseAbiParameters("address"), [
          sessionKey.ethereumAddress,
        ])
      )
    ),
  };
  payload.sessionPkClientSignature = await signMessage({
    message,
    privateKey: clientPriv,
  });
  payload.sessionDataUserSignature = await signMessage({
    message,
    privateKey: sessionKey.privateKeyHexWith0x,
  });
  // console.log("signed payload: ", payload);

  return payload;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // console.log("Received request body:", body);
    
    let idToken: string;
    let provider: string;

    // Handle different request body structures
    if (body.extra_params) {
      // Current structure with extra_params
      ({ idToken, provider } = body.extra_params);
    } else if (body.idToken && body.provider) {
      // Direct structure
      ({ idToken, provider } = body);
    } else if (body.auth_token) {
      // Email auth token (from email OTP flow)
      idToken = body.auth_token;
      provider = body.provider || "okto"; // Default to "okto" for email auth
    } else {
      return NextResponse.json(
        { error: 'Invalid request format. Expected idToken and provider, or auth_token' }, 
        { status: 400 }
      );
    }

    // console.log("idToken: ", idToken);
    // console.log("provider: ", provider);
    
    // Validate required fields
    if (!idToken || !provider) {
      return NextResponse.json(
        { error: 'idToken and provider are required' }, 
        { status: 400 }
      );
    }

    const data = {
      idToken,
      provider,
    };
   
    // Create a new session key using a random private key
    const session = SessionKey.create();
    // console.log("session created");

    const authPayload = await generateAuthPayload(
      data,
      session,
      clientSWA,
      clientPrivateKey
    );

    console.log("calling authenticate...");
    console.log("authPayload: ", authPayload);
    
    const response = await invokeAuthenticate(authPayload);

    if (response.status === 200) {
      // console.log("provider: ", provider);
      // console.log("response : ", response.data);
    
      const sessionConfig = {
        sessionPrivKey: session.privateKeyHexWith0x,
        sessionPubKey: session.uncompressedPublicKeyHexWith0x,
        userSWA: response.data.data.userSWA,
      };
      // console.log("Session Config: ", sessionConfig);

      // STEP 2: Get the authorization token using the sessionConfig object
      const authToken = await getAuthorizationToken(sessionConfig);
      // console.log("Okto session authToken: ", authToken);

      return NextResponse.json({
        success: true,
        authToken,
        sessionConfig,
        userSWA: response.data.data.userSWA,
        provider
      });

    } else {
      console.error("Failed to get Okto token");
      return NextResponse.json(
        { error: 'Failed to authenticate with Okto' }, 
        { status: response.status }
      );
    }
  } catch (error: any) {
    console.error("Error from route.ts:", error);
    return NextResponse.json(
      { error: error.message || 'An error occurred while fetching the Okto token' }, 
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