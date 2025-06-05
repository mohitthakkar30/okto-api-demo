import axios from "axios";

const FINAL_STATUSES = ["SUCCESSFUL", "FAILED", "BUNDLER_DISCARDED"];

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getOrderHistory(
    OktoAuthToken: string,
    intentId: string,
    intentType: string,
    intervalMs: number = 5000
) {
    while (true) {
        try {
            console.log("Polling Order History...");
            // console.log("Intent ID:", intentId);
            // console.log("Intent Type:", intentType);
            // console.log("Authorization Token:", OktoAuthToken);
            
            const response = await axios.get(
                `https://sandbox-api.okto.tech/api/oc/v1/orders?intent_id=${intentId}&intent_type=${intentType}`,
                {
                    headers: {
                        Authorization: `Bearer ${OktoAuthToken}`,
                    },
                }
            );
            // console.log("Order History Response:", response.data);
            
            const items = response.data?.data?.items;
            const status = items?.[0]?.status;

            console.log("Current Order Status:", status);

            if (FINAL_STATUSES.includes(status)) {
                // console.log("Final Status Reached:", status);
                // console.log("Full Order:", JSON.stringify(items[0], null, 2));
                return status;
            }

            await delay(intervalMs);
        } catch (error) {
            console.error("Error while polling order status:", error);
            throw new Error("Polling failed");
        }
    }
}
