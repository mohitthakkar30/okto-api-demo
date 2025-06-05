/**
 * Serializes a JavaScript object to JSON string
 * @param obj - The object to serialize
 * @returns Serialized JSON string
 */
export function serializeJSON(obj: any): string {
    return JSON.stringify(obj);
  }