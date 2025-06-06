import { NextRequest, NextResponse } from 'next/server';
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiParameters,
  toHex,
  type Hex,
} from "viem";
import { v4 as uuidv4 } from "uuid";

// Import your helper files - EXACT PATHS FROM SCRIPT
import { INTENT_ABI } from "../../../helper/abi";
import { Constants } from "../../../helper/constants";
import { paymasterData } from "../../../utils/generatePaymasterData";
import { nonceToBigInt } from "../../../helper/nonceToBigInt";
import {
  signUserOp,
  executeUserOp,
  type SessionConfig,
  getUserOperationGasPrice,
} from "../../../utils/invokeExecuteUserOp";
import { getChains } from "../../../utils/getChains"; // ✅ FIXED: Use explorer path like script
import { getOrderHistory } from "../../../utils/getOrderHistory";
import type { Address } from "../../../helper/types";

// Hardcoded values from script - EXACT MATCH
const clientSWA = "0xaA3E06Db62661dcCE9EcdD27cc92bA4B4d6204f1"; // No Hex casting like script
let OktoAuthToken = ""; // Will be set dynamically from auth header

interface Data {
  caip2Id: string;
  recipient: string;
  token: string;
  amount: number;
}

interface TransferTokenRequest {
  sessionConfig: SessionConfig;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    console.log("=== API ENVIRONMENT DEBUG ===");
    console.log("Node.js version:", process.version);
    console.log("Platform:", process.platform);
    console.log("Current working directory:", process.cwd());
    console.log("Environment:", process.env.NODE_ENV);
    console.log("Timestamp:", new Date().toISOString());
    console.log("==============================");
    
    console.log("=== API Request Started ===");
    
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }
    
    // Set dynamic OktoAuthToken
    OktoAuthToken = authHeader.substring(7);

    let body: TransferTokenRequest;
    try {
      body = await request.json();
      console.log("✅ Request body parsed successfully");
    } catch (parseError) {
      console.log("❌ JSON parsing error:", parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const { sessionConfig } = body;

    // Validate sessionConfig
    if (!sessionConfig) {
      console.log("❌ Missing sessionConfig");
      return NextResponse.json(
        { error: 'Missing required parameter: sessionConfig' },
        { status: 400 }
      );
    }
    
    console.log("Request parameters validated:");
    console.log("sessionConfig userSWA:", sessionConfig.userSWA);
    
    // Use EXACT same values as the successful script
    const data: Data = {
      caip2Id: "eip155:8453", // BASE (same as script)
      recipient: "0x111423FA917A010A4f62c9B2742708744B4CbFc4", // Same as script
      token: "", // Same as script
      amount: 1000000000000, // Same as script
    };

    // Hardcoded feePayerAddress from script
    const feePayerAddress: Address = "0x5A2d9032605DA34A0a2a413143e111bcFA6Dd697";
    
    console.log("=== COMPARING WITH SCRIPT VALUES ===");
    console.log("API clientSWA:", clientSWA);
    console.log("API OktoAuthToken (first 20 chars):", OktoAuthToken.substring(0, 20) + "...");
    console.log("API sessionConfig:", {
      userSWA: sessionConfig.userSWA,
      // sessionPubkey: sessionConfig.sessionPubkey.substring(0, 20) + "...",
      // sessionPrivKey: sessionConfig.sessionPrivKey.substring(0, 20) + "..."
    });
    console.log("API data:", data);
    console.log("API feePayerAddress:", feePayerAddress);
    console.log("=========================================");
    
    // Call transferToken function with exact same signature as script
    const jobId = await transferToken(data, sessionConfig, feePayerAddress);
    
    console.log("Job ID:", jobId);
    
    // Get transaction details with retry logic
    let txnDetails;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        txnDetails = await getOrderHistory(OktoAuthToken, jobId, "TOKEN_TRANSFER");
        
        // Check if the transaction was discarded
        if (txnDetails && txnDetails.order_status === 'BUNDLER_DISCARDED') {
          console.log("❌ BUNDLER_DISCARDED detected");
          console.log("Full transaction details:", JSON.stringify(txnDetails, null, 2));
          
          return NextResponse.json({
            success: false,
            jobId,
            txnDetails,
            error: "Transaction was discarded by bundler",
            troubleshooting: {
              possibleCauses: [
                "Gas estimation issues",
                "Paymaster problems", 
                "Network congestion",
                "Invalid user operation"
              ],
              suggestions: [
                "Try with testnet first",
                "Check if wallet has sufficient funds",
                "Wait and retry",
                "Contact Okto support with jobId: " + jobId
              ]
            },
            message: "Token transfer was discarded by bundler"
          }, { status: 400 });
        }
        
        break; // Success, exit retry loop
      } catch (historyError) {
        attempts++;
        console.log(`Attempt ${attempts} to get order history failed:`, historyError);
        if (attempts >= maxAttempts) {
          throw historyError;
        }
      }
    }

    return NextResponse.json({
      success: true,
      jobId,
      txnDetails,
      data: data, // Return the hardcoded data used
      message: "Token transfer initiated successfully"
    });

  } catch (error) {
    console.error('Token transfer error:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('insufficient funds')) {
        return NextResponse.json(
          { error: 'Insufficient funds for gas fees. Please ensure your wallet has enough ETH for transaction fees.' },
          { status: 400 }
        );
      }
      if (error.message.includes('Chain') && error.message.includes('not supported')) {
        return NextResponse.json(
          { error: 'Unsupported blockchain network' },
          { status: 400 }
        );
      }
      if (error.message.includes('Invalid session')) {
        return NextResponse.json(
          { error: 'Invalid session configuration' },
          { status: 400 }
        );
      }
      if (error.message.includes('Policy Error') || error.message.includes('Token Mapping')) {
        return NextResponse.json(
          { error: 'Okto configuration error: Client Token Mapping not configured. Please configure token mapping in your Okto dashboard.' },
          { status: 400 }
        );
      }
      if (error.message.includes('BUNDLER_DISCARDED') || error.message.includes('discarded')) {
        return NextResponse.json(
          { 
            error: 'Transaction discarded by bundler',
            details: 'The user operation was rejected. This could be due to gas issues, paymaster problems, or network congestion.',
            suggestions: [
              'Try again with a smaller amount',
              'Switch to testnet for testing', 
              'Wait a few minutes and retry',
              'Check wallet balance for gas fees'
            ]
          },
          { status: 400 }
        );
      }
    }
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false
      },
      { status: 500 }
    );
  }
}

/**
 * Creates and executes a user operation for token transfer.
 * This function is EXACTLY the same as the script's transferToken function.
 *
 * @param data - The parameters for transferring the token (caip2Id, recipientWalletAddress, tokenAddress, amount)
 * @param sessionConfig - The sessionConfig object containing user SWA and session keys.
 * @param feePayerAddress - Optional sponsor wallet address for gas fees
 * @returns The job ID for the token transfer.
 */
async function transferToken(
  data: Data,
  sessionConfig: SessionConfig,
  feePayerAddress?: Address
): Promise<string> {
  console.log("=== INSIDE TRANSFERTOKEN FUNCTION ===");
  console.log("Function clientSWA:", clientSWA);
  console.log("Function OktoAuthToken (first 20):", OktoAuthToken.substring(0, 20) + "...");
  console.log("Function data:", data);
  console.log("Function sessionConfig userSWA:", sessionConfig.userSWA);
  console.log("Function feePayerAddress:", feePayerAddress);
  console.log("====================================");
  
  // Generate a unique UUID based nonce
  const nonce = uuidv4();
  console.log("Generated nonce:", nonce);

  // Get the Intent execute API info
  const jobParametersAbiType =
    "(string caip2Id, string recipientWalletAddress, string tokenAddress, uint amount)";
  const gsnDataAbiType = `(bool isRequired, string[] requiredNetworks, ${jobParametersAbiType}[] tokens)`;

  // get the Chain CAIP2ID required for payload construction
  // Note: Only the chains enabled on the Client's Developer Dashboard will be shown in the response
  const chains = await getChains(OktoAuthToken);
  console.log("Chains: ", chains);

  const currentChain = chains.find(
    (chain: any) => chain.caip_id.toLowerCase() === data.caip2Id.toLowerCase()
  );

  if (!currentChain) {
    throw new Error(`Chain Not Supported`);
  }

  // if feePayerAddress is not provided, it will be set to the default value '0x0000000000000000000000000000000000000000
  if (!feePayerAddress) {
    feePayerAddress = Constants.FEE_PAYER_ADDRESS;
  }

  console.log("feePayerAddress:", feePayerAddress);
  console.log("current chain:", currentChain);

  // create the UserOp Call data for token transfer intent
  console.log("=== CALLDATA GENERATION DEBUG ===");
  console.log("nonceToBigInt(nonce):", nonceToBigInt(nonce));
  console.log("toHex(nonceToBigInt(nonce), { size: 32 }):", toHex(nonceToBigInt(nonce), { size: 32 }));
  console.log("Constants.EXECUTE_USEROP_FUNCTION_SELECTOR:", Constants.EXECUTE_USEROP_FUNCTION_SELECTOR);
  console.log("Constants.ENV_CONFIG.SANDBOX.JOB_MANAGER_ADDRESS:", Constants.ENV_CONFIG.SANDBOX.JOB_MANAGER_ADDRESS);
  console.log("Constants.USEROP_VALUE:", Constants.USEROP_VALUE);
  console.log("Constants.FUNCTION_NAME:", Constants.FUNCTION_NAME);
  console.log("Constants.INTENT_TYPE.TOKEN_TRANSFER:", Constants.INTENT_TYPE.TOKEN_TRANSFER);
  console.log("=================================");

  const calldata = encodeAbiParameters(
    parseAbiParameters("bytes4, address,uint256, bytes"),
    [
      Constants.EXECUTE_USEROP_FUNCTION_SELECTOR,
      Constants.ENV_CONFIG.SANDBOX.JOB_MANAGER_ADDRESS,
      Constants.USEROP_VALUE,
      encodeFunctionData({
        abi: INTENT_ABI,
        functionName: Constants.FUNCTION_NAME,
        args: [
          toHex(nonceToBigInt(nonce), { size: 32 }),
          clientSWA,
          sessionConfig.userSWA,
          feePayerAddress,
          encodeAbiParameters(
            parseAbiParameters("(bool gsnEnabled, bool sponsorshipEnabled)"),
            [
              {
                gsnEnabled: currentChain.gsn_enabled ?? false,
                sponsorshipEnabled: currentChain.sponsorship_enabled ?? false,
              },
            ]
          ),
          encodeAbiParameters(parseAbiParameters(gsnDataAbiType), [
            {
              isRequired: false,
              requiredNetworks: [],
              tokens: [],
            },
          ]),
          encodeAbiParameters(parseAbiParameters(jobParametersAbiType), [
            {
              amount: BigInt(data.amount),
              caip2Id: data.caip2Id,
              recipientWalletAddress: data.recipient,
              tokenAddress: data.token,
            },
          ]),
          Constants.INTENT_TYPE.TOKEN_TRANSFER,
        ],
      }),
    ]
  );
  
  console.log("=== CALLDATA RESULT ===");
  console.log("calldata length:", calldata.length);
  console.log("calldata:", calldata);
  console.log("=====================");
  
  // Compare with script's expected calldata:
  const expectedCalldata = "0x8dd7712f00000000000000000000000000000000000000000000000000000000000000000000000000000000e2bb608bf66b81d3edc93e77ef1cddee4fdc679e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000003e48fa61ac000000000000000000000000000000000cfcb83f026674a128790839a86e944d7000000000000000000000000e8201e368557508bf183d4e2dce1b1a1e0bd20fa000000000000000000000000fbb05b5bf0192458e0ca5946d7b82a61eba9802500000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000003a000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000002540be400000000000000000000000000000000000000000000000000000000000000000c6569703135353a38343533320000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a307839363762323663396537376632663565303735336263626362326262363234653562626666323463000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e544f4b454e5f5452414e5346455200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
  
  console.log("=== CALLDATA COMPARISON ===");
  console.log("API calldata matches script:", calldata.substring(0, 200) === expectedCalldata.substring(0, 200));
  console.log("Expected (first 200):", expectedCalldata.substring(0, 200));
  console.log("Actual   (first 200):", calldata.substring(0, 200));
  console.log("==========================");
  console.log("calldata length:", calldata.length);
  
  // Compare this calldata with the script's output
  console.log("=== CALLDATA COMPARISON POINT ===");
  console.log("If this doesn't match the script's calldata, we found the issue!");
  console.log("================================");

  const gasPrice = await getUserOperationGasPrice(OktoAuthToken);
  console.log("Gas prices from API:", gasPrice);

  // Construct the UserOp with all the data fetched above, sign it and add the signature to the userOp
  const userOp = {
    sender: sessionConfig.userSWA,
    nonce: toHex(nonceToBigInt(nonce), { size: 32 }),
    paymaster: Constants.ENV_CONFIG.SANDBOX.PAYMASTER_ADDRESS, //paymaster address
    callGasLimit: toHex(Constants.GAS_LIMITS.CALL_GAS_LIMIT),
    verificationGasLimit: toHex(Constants.GAS_LIMITS.VERIFICATION_GAS_LIMIT),
    preVerificationGas: toHex(Constants.GAS_LIMITS.PRE_VERIFICATION_GAS),
    maxFeePerGas: gasPrice.maxFeePerGas,
    maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
    paymasterPostOpGasLimit: toHex(
      Constants.GAS_LIMITS.PAYMASTER_POST_OP_GAS_LIMIT
    ),
    paymasterVerificationGasLimit: toHex(
      Constants.GAS_LIMITS.PAYMASTER_VERIFICATION_GAS_LIMIT
    ),
    callData: calldata,
    paymasterData: await paymasterData({
      nonce,
      validUntil: new Date(Date.now() + 6 * Constants.HOURS_IN_MS),
    }),
  };
  console.log("Unsigned UserOp: ", userOp);

  // Sign the userOp
  const signedUserOp = await signUserOp(userOp, sessionConfig);
  console.log("Signed UserOp: ", signedUserOp);
  
  // Log detailed UserOp for debugging
  console.log("=== DETAILED USEROP DEBUG ===");
  console.log("Sender:", signedUserOp.sender);
  console.log("Nonce:", signedUserOp.nonce);
  console.log("CallGasLimit:", signedUserOp.callGasLimit);
  console.log("VerificationGasLimit:", signedUserOp.verificationGasLimit);
  console.log("PreVerificationGas:", signedUserOp.preVerificationGas);
  console.log("MaxFeePerGas:", signedUserOp.maxFeePerGas);
  console.log("MaxPriorityFeePerGas:", signedUserOp.maxPriorityFeePerGas);
  console.log("Paymaster:", signedUserOp.paymaster);
  console.log("PaymasterData length:", signedUserOp.paymasterData?.length);
  console.log("Signature length:", signedUserOp.signature?.length);
  console.log("===============================");

  // Execute the userOp
  console.log("Executing UserOp...");
  const jobId = await executeUserOp(signedUserOp, OktoAuthToken);
  console.log("Job ID:", jobId);

  return jobId;
}