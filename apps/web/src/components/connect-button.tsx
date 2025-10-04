"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "./ui/button";
import { useNitroliteAuth } from "@/hooks/useNitroliteAuth";

export function ConnectButton() {
	const { address, isConnected } = useAccount();
	const { connect, connectors, isPending } = useConnect();
	const { disconnect } = useDisconnect();
	const {
		status: authStatus,
		error: authError,
		sessionKey,
		connectAndAuthenticate,
		disconnect: disconnectAuth,
	} = useNitroliteAuth();

	if (isConnected && address) {
		return (
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<span className="text-sm">
						{address.slice(0, 6)}...{address.slice(-4)}
					</span>
					<Button
						variant="outline"
						onClick={() => {
							disconnectAuth();
							disconnect();
						}}
					>
						Disconnect
					</Button>
				</div>

				{authStatus === "idle" && (
					<Button onClick={connectAndAuthenticate} size="sm">
						Sign & Authenticate
					</Button>
				)}

				{authStatus === "connecting" && (
					<Button disabled size="sm">
						Connecting to ClearNode...
					</Button>
				)}

				{authStatus === "signing" && (
					<Button disabled size="sm">
						Please sign message...
					</Button>
				)}

				{authStatus === "authenticating" && (
					<Button disabled size="sm">
						Authenticating...
					</Button>
				)}

				{authStatus === "authenticated" && sessionKey && (
					<div className="text-xs text-green-600 dark:text-green-400">
						✓ Authenticated (Session: {sessionKey.slice(0, 6)}...
						{sessionKey.slice(-4)})
					</div>
				)}

				{authStatus === "error" && authError && (
					<div className="text-xs text-red-600 dark:text-red-400">
						Error: {authError}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="flex gap-2">
			{connectors.map((connector) => (
				<Button
					key={connector.uid}
					onClick={() => connect({ connector })}
					disabled={isPending}
				>
					{isPending ? "Connecting..." : `Connect ${connector.name}`}
				</Button>
			))}
		</div>
	);
}
