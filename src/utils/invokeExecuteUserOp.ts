import axios from "axios";
import { signMessage } from "viem/accounts";
import { fromHex } from "viem";
import { generatePackedUserOp, generateUserOpHash } from "./generateUserOp";
import { log } from "node:console";
import { v4 as uuidv4 } from "uuid";

export interface SessionConfig {
  sessionPrivKey: string;
  sessionPubkey: string;
  userSWA: string;
}

/**
 * Signs a user operation
 *
 * This function converts a user operation to its packed format, generates a hash,
 * and signs it using the provided session private key.
 *
 * @param userop - The user operation object containing all transaction details such as:
 *                 sender, nonce, callData, gas parameters, etc.
 * @param sessionConfig - Configuration containing session credentials:
 *                       - sessionPrivKey: The private key used for signing
 *                       - sessionPubkey: The corresponding public key
 *                       - userSWA: The user's Smart Wallet Account address
 *
 * @returns The original user operation with the signature field added
 */
export async function signUserOp(userop: any, sessionConfig: SessionConfig) {
  const privateKey = sessionConfig.sessionPrivKey as `0x${string}`;
  const packeduserop = generatePackedUserOp(userop);
  const hash = generateUserOpHash(packeduserop);
  const sig = await signMessage({
    message: {
      raw: fromHex(hash, "bytes"),
    },
    privateKey,
  });
  userop.signature = sig;
  return userop;
}

/**
 * Execute a user operation
 *
 * This function sends the signed user operation to Okto's gateway for execution
 * using a JSON-RPC request.
 *
 * @param userop - The signed user operation object containing all transaction details
 *                and the signature generated by signUserOp
 * @param authToken - Authentication token for Okto's API, generated from getAuthorizationToken
 *
 * @returns The job ID that can be used to track the transaction's status
 *
 */
export async function executeUserOp(userOp: any, oktoAuthToken: string): Promise<string> {
  try {
    // console.log("Sending UserOp to Okto Gateway API...");
    
    // New JSON-RPC format as per documentation
    const requestBody = {
      jsonrpc: "2.0",
      method: "execute",
      id: uuidv4(), // Generate unique request ID
      params: [userOp]
    };
    
    // console.log("API URL: https://sandbox-okto-gateway.oktostage.com/rpc");
    // console.log("Request payload:", JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post(
      "https://sandbox-okto-gateway.oktostage.com/rpc", 
      requestBody,
      { 
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${oktoAuthToken}`,
        },
        timeout: 30000, // 30 second timeout
      }
    );

    // console.log("Okto Gateway Response:", response.data);
    
    // Check for JSON-RPC errors
    if (response.data.error) {
      throw new Error(`Okto Gateway Error: ${JSON.stringify(response.data.error)}`);
    }
    
    // Return the jobId from the result
    return response.data.result.jobId;
    
  } catch (error: any) {
    console.error("ExecuteUserOp Error Details:");
    console.error("Status:", error.response?.status);
    console.error("Status Text:", error.response?.statusText);
    console.error("Response Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("Request Config:", {
      url: error.config?.url,
      method: error.config?.method,
      headers: error.config?.headers,
    });
    
    // Check for specific error types
    if (error.response?.data?.error) {
      throw new Error(`Okto Gateway Error: ${JSON.stringify(error.response.data.error)}`);
    }
    
    if (error.response?.status === 400) {
      throw new Error(`Bad Request: Please check UserOp structure and parameters`);
    }
    
    if (error.response?.status === 401) {
      throw new Error(`Unauthorized: Invalid or expired authentication token`);
    }
    
    throw error;
  }
}

export async function getUserOperationGasPrice(authToken: string) {

  const response = await axios.get(
    "https://sandbox-api.okto.tech/api/oc/v1/gas-values", 
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );

  // console.log("Gas Price Response:", response.data);

  return response.data?.data;
}
