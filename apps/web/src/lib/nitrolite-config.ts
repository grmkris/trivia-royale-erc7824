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
		tokenAddress: "0x0000000000000000000000000000000000000000" as const,
	},

	// Auth domain (must match app_name)
	authDomain: {
		name: "Test Domain",
	} as EIP712AuthDomain,

	// Auth parameters
	auth: {
		appName: "Test Domain",
		scope: "console",
		application: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as const,
		expireSeconds: 3600, // 1 hour
	},
} as const;
