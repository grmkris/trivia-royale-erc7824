/**
 * Nitrolite Configuration
 * Hardcoded config for ClearNode authentication
 */

import type { EIP712AuthDomain } from "@erc7824/nitrolite";

export const NITROLITE_CONFIG = {
	// ClearNode WebSocket URL
	clearNodeUrl: "ws://localhost:8000/ws",

	// Contract addresses (from backend PoC)
	contracts: {
		custody: "0x019B65A265EB3363822f2752141b3dF16131b262" as const,
		adjudicator: "0x7c7ccbc98469190849BCC6c926307794fDfB11F2" as const,
		tokenAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const, // USDC on Sepolia
		brokerAddress: "0xa5819442D1A69337ca93b688994Ae27E8C58D019" as const, // Broker address
	},

	// Token configuration
	token: {
		symbol: "USDC",
		decimals: 6,
	},

	// Auth domain (must match app_name)
	authDomain: {
		name: "Test Domain",
	} as EIP712AuthDomain,

	// Auth parameters
	auth: {
		appName: "Test Domain",
		scope: "console",
		application: "0xA7985cb537FC788283b5bEE56178CB5be95103eF" as const,
		expireSeconds: 3600, // 1 hour
	},
} as const;
