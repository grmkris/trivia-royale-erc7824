/**
 * WebSocket RPC Helper
 *
 * Type-safe helper for sending RPC requests over WebSocket.
 * Handles WebSocket boilerplate: message filtering, timeouts, cleanup, error handling.
 *
 * Returns the raw RPC response - caller handles parsing and business logic.
 */

import { parseAnyRPCResponse, RPCMethod } from "@erc7824/nitrolite";

/**
 * Extract the return type from parseAnyRPCResponse
 * This is a discriminated union of all RPC response types
 */
export type AnyRPCResponse = ReturnType<typeof parseAnyRPCResponse>;

export interface RPCOptions {
	/**
	 * Timeout in milliseconds (default: 30000)
	 */
	timeout?: number;

	/**
	 * Optional custom error handler
	 * Return value to resolve, or throw to reject
	 */
	errorHandler?: (errorResponse: AnyRPCResponse) => AnyRPCResponse;
}

/**
 * Send an RPC request over WebSocket and wait for response
 *
 * Type-safe helper that:
 * 1. Sends message
 * 2. Waits for response matching expectedMethod
 * 3. Returns raw RPC response object (discriminated union)
 * 4. Handles cleanup, timeouts, errors
 *
 * @param ws - WebSocket connection
 * @param message - RPC message string (or Promise that resolves to string)
 * @param expectedMethod - Expected RPC method to filter responses
 * @param options - Optional timeout and error handler
 * @returns Promise that resolves with RPC response (type narrowable by method field)
 *
 * @example
 * const response = await sendRPCRequest(
 *   ws,
 *   createCloseChannelMessage(signer, channelId, address),
 *   RPCMethod.CloseChannel,
 *   { timeout: 60000 }
 * );
 * // response is AnyRPCResponse - a discriminated union
 * const parsed = parseCloseChannelResponse(response);
 */
export async function sendRPCRequest(
	ws: WebSocket,
	message: string | Promise<string>,
	expectedMethod: RPCMethod,
	options: RPCOptions = {},
): Promise<AnyRPCResponse> {
	const { timeout = 30000, errorHandler } = options;

	return new Promise(async (resolve, reject) => {
		let timeoutId: NodeJS.Timeout | undefined;

		try {
			// Create message handler
			const handleMessage = (event: MessageEvent) => {
				try {
					const response = parseAnyRPCResponse(event.data);

					// Check if this is the expected response
					if (response.method === expectedMethod) {
						ws.removeEventListener("message", handleMessage);
						if (timeoutId) clearTimeout(timeoutId);
						resolve(response);
					}
					// Handle error responses
					else if (response.method === RPCMethod.Error) {
						ws.removeEventListener("message", handleMessage);
						if (timeoutId) clearTimeout(timeoutId);

						// Try custom error handler first
						if (errorHandler) {
							try {
								const result = errorHandler(response);
								resolve(result);
							} catch (error) {
								reject(error);
							}
							return;
						}

						// Default error handling
						reject(new Error(`RPC Error: ${JSON.stringify(response.params)}`));
					}
				} catch (error) {
					// Ignore parsing errors - might be other messages
				}
			};

			// Set up timeout
			timeoutId = setTimeout(() => {
				ws.removeEventListener("message", handleMessage);
				reject(new Error(`Timeout waiting for ${expectedMethod}`));
			}, timeout);

			// Add message handler
			ws.addEventListener("message", handleMessage);

			// Send message (await if it's a Promise)
			const messageStr = await message;
			ws.send(messageStr);
		} catch (error) {
			if (timeoutId) clearTimeout(timeoutId);
			reject(error);
		}
	});
}
