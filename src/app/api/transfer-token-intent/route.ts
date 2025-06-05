import { NextRequest, NextResponse } from 'next/server';
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiParameters,
  toHex,
  type Hex,
} from "viem";
import { v4 as uuidv4 } from "uuid";

// Import your helper files (you'll need to create these)
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
import { getChains } from "../../../utils/getChains";
import { getOrderHistory } from "../../../utils/getOrderHistory";
import type { Address } from "../../../helper/types";

interface TransferTokenIntentRequest {
  caip2Id: string;
  recipient: string;
  token: string;
  amount: number;
  sessionConfig: SessionConfig;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }
    
    const body: TransferTokenIntentRequest = await request.json();
    const { recipient, amount, sessionConfig } = body;
    
    // Configuration for non-sponsored mode
    const oktoAuthToken = authHeader.substring(7);
    const token = ""; // Empty string for native token transfers
    const caip2Id = "eip155:8453"; // Base mainnet CAIP-2 ID
    
    // Validate required environment variables
    const clientSWA = process.env.NEXT_PUBLIC_OKTO_SWA as Hex;
    // console.log("clientSWA:", clientSWA);
    
    if (!clientSWA) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_OKTO_SWA environment variable' },
        { status: 500 }
      );
    }

    // Validate request body
    if (!caip2Id || !recipient || amount < 0 || !sessionConfig) {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      );
    }
    
    // console.log("Request parameters validated:");
    // console.log("caip2Id:", caip2Id);
    // console.log("recipient:", recipient);
    // console.log("amount:", amount);
    // console.log("sessionConfig:", sessionConfig);
    
    const jobId = await transferTokenIntent(
      { caip2Id, recipient, token, amount },
      sessionConfig,
      clientSWA,
      oktoAuthToken
    );
    
    // console.log("Job ID:", jobId);
    
    // Get transaction details
    const txnDetails = await getOrderHistory(
      oktoAuthToken,
      jobId,
      "TOKEN_TRANSFER"
    );

    return NextResponse.json({
      success: true,
      jobId,
      txnDetails,
      message: "Token transfer initiated successfully"
    });

  } catch (error) {
    console.error('Token transfer intent error:', error);
    
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

async function transferTokenIntent(
  data: { caip2Id: string; recipient: string; token: string; amount: number },
  sessionConfig: SessionConfig,
  clientSWA: Hex,
  oktoAuthToken: string
): Promise<string> {
    // console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$");
    // console.log("Caip2Id:", data.caip2Id);
    // console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$");
    
  const nonce = uuidv4();

  const jobParametersAbiType =
    "(string caip2Id, string recipientWalletAddress, string tokenAddress, uint amount)";
  const gsnDataAbiType = `(bool isRequired, string[] requiredNetworks, ${jobParametersAbiType}[] tokens)`;

  // Get supported chains
  const chains = await getChains(oktoAuthToken);
//   console.log("Available chains:", chains.map((chain:any) => ({
//     caip_id: chain.caip_id,
//     network_name: chain.network_name,
//     sponsorship_enabled: chain.sponsorship_enabled,
//     gsn_enabled: chain.gsn_enabled
//   })));
  
  const currentChain = chains.find(
    (chain: any) => chain.caip_id.toLowerCase() === data.caip2Id.toLowerCase()
  );

  if (!currentChain) {
    throw new Error(`Chain ${data.caip2Id} is not supported. Available chains: ${chains.map((c: any) => c.caip_id).join(', ')}`);
  }
  
//   console.log("=======================================");
//   console.log("Current chain:", currentChain);
//   console.log("Data:", data);
//   console.log("Client SWA:", clientSWA);
//   console.log("Session Config:", sessionConfig);
//   console.log("Sponsorship enabled:", currentChain.sponsorship_enabled);
//   console.log("GSN enabled:", currentChain.gsn_enabled);
//   console.log("=======================================");
  
  // For non-sponsored mode, always use the default fee payer address
  const feePayerAddress = "0x5A2d9032605DA34A0a2a413143e111bcFA6Dd697" //Constants.FEE_PAYER_ADDRESS;
  
//   console.log("Using fee payer address:", feePayerAddress);

  // Create UserOp calldata
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
              amount: BigInt(data.amount*1e18),
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

//   console.log("Calldata generated successfully");

  // Get current gas prices
  const gasPrice = await getUserOperationGasPrice(oktoAuthToken);
//   console.log("Gas prices:", gasPrice);
  
  // Ensure gas prices are properly formatted
  if (!gasPrice.maxFeePerGas || !gasPrice.maxPriorityFeePerGas) {
    throw new Error("Failed to get valid gas prices from Okto API");
  }

  // Generate paymaster data
//   console.log("Generating paymaster data...");
  const paymasterDataResult = await paymasterData({
    nonce,
    validUntil: new Date(Date.now() + 6 * Constants.HOURS_IN_MS),
  });
//   console.log("Paymaster data generated:", paymasterDataResult);
  
  if (!paymasterDataResult) {
    throw new Error("Failed to generate paymaster data");
  }

  // Construct UserOp
  const userOp = {
    sender: sessionConfig.userSWA,
    nonce: toHex(nonceToBigInt(nonce), { size: 32 }),
    paymaster: Constants.ENV_CONFIG.SANDBOX.PAYMASTER_ADDRESS,
    callGasLimit: toHex(Constants.GAS_LIMITS.CALL_GAS_LIMIT),
    verificationGasLimit: toHex(Constants.GAS_LIMITS.VERIFICATION_GAS_LIMIT),
    preVerificationGas: toHex(Constants.GAS_LIMITS.PRE_VERIFICATION_GAS),
    maxFeePerGas: gasPrice.maxFeePerGas,
    maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
    paymasterPostOpGasLimit: toHex(Constants.GAS_LIMITS.PAYMASTER_POST_OP_GAS_LIMIT),
    paymasterVerificationGasLimit: toHex(Constants.GAS_LIMITS.PAYMASTER_VERIFICATION_GAS_LIMIT),
    callData: calldata,
    paymasterData: paymasterDataResult,
  };

//   console.log("UserOp constructed:", {
//     sender: userOp.sender,
//     nonce: userOp.nonce,
//     paymaster: userOp.paymaster,
//     maxFeePerGas: userOp.maxFeePerGas,
//     maxPriorityFeePerGas: userOp.maxPriorityFeePerGas
//   });

  // Sign and execute UserOp
//   console.log("Signing UserOp...");
  const signedUserOp = await signUserOp(userOp, sessionConfig);
//   console.log("UserOp signed successfully");
//   console.log("Signed UserOp structure:", JSON.stringify(signedUserOp, null, 2));
  
  // Validate UserOp before execution
//   console.log("Validating UserOp structure...");
  validateUserOp(signedUserOp);
  
//   console.log("Executing UserOp...");
  const jobId = await executeUserOp(signedUserOp, oktoAuthToken);
//   console.log("UserOp executed, Job ID:", jobId);

  return jobId;
}

// Add validation function
function validateUserOp(userOp: any) {
  const requiredFields = [
    'sender', 'nonce', 'callData', 'callGasLimit', 'verificationGasLimit',
    'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas', 'signature'
  ];
  
  const missingFields = requiredFields.filter(field => !userOp[field]);
  if (missingFields.length > 0) {
    throw new Error(`Missing required UserOp fields: ${missingFields.join(', ')}`);
  }
  
  // Check if values are properly formatted as hex
  const hexFields = ['nonce', 'callGasLimit', 'verificationGasLimit', 'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas'];
  hexFields.forEach(field => {
    if (userOp[field] && !userOp[field].startsWith('0x')) {
      throw new Error(`Field ${field} must be hex encoded: ${userOp[field]}`);
    }
  });
  
//   console.log("UserOp validation passed");
}


// Export for potential external use
export { transferTokenIntent };