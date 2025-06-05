import { NextRequest, NextResponse } from 'next/server';
import { invokeAuthenticate } from '../../../utils/okto-auth';
import { v4 as uuidv4 } from "uuid";
import {generatePaymasterData} from '../../../utils/generatePaymasterData';
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
  payload.sessionData.maxPriorityFeePerGas = "0x2D79883D2000"; // constant on okto chain
  payload.sessionData.maxFeePerGas = "0x2D79883D2000"; // constant on okto chain
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
          sessionKey.ethereumAddress as Hex,
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
    privateKey: sessionKey.privateKeyHexWith0x as Hex
  });
  console.log("signed payload: ");
  return payload;
}
export async function POST(request: NextRequest) {
  try {
    const authPayload = await request.json();
    // console.log("Received Auth Payload:", authPayload);
    // console.log("========================================================");
    // console.log("Private key:", authPayload.session.privateKeyHexWith0x);
    //   console.log("Public key:", authPayload.session.uncompressedPublicKeyHexWith0x);
    //   console.log("Ethereum address:", authPayload.session.ethereumAddress);
    //   console.log("Address length:", authPayload.session.ethereumAddress?.length);
    const session = SessionKey.create(); 
    
    const load = await generateAuthPayload(authPayload.extra_params, session, clientSWA, clientPrivateKey);
    
          // console.log("Private key:", session.privateKeyHexWith0x);
      // console.log("Public key:", session.uncompressedPublicKeyHexWith0x);
      // console.log("Ethereum address:", session.ethereumAddress);
      // console.log("Address length:", session.ethereumAddress?.length);
      console.log("========================================================");
    console.log("Generated Load for Okto Authenticate:");
    console.log(load);
    console.log("========================================================");
      
    const response = await invokeAuthenticate(load);
    console.log("========================================================");
    
    console.log("Response from Okto Authenticate:");
    return NextResponse.json(response.data);
  } catch (error: any) {
    console.log("Error from route.ts");
    
    return NextResponse.json(
      { error: error.message }, 
      { status: 400 }
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