"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "./ui/button";
import { useNitroliteAuth } from "@/hooks/useNitroliteAuth";

export function ConnectButton() {
	const account = useAccount();
	const connect = useConnect();
	const disconnect = useDisconnect();
	const nitroliteAuth = useNitroliteAuth();

	if (account.isConnected && account.address) {
		return (
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<span className="text-sm">
						{account.address.slice(0, 6)}...{account.address.slice(-4)}
					</span>
					<Button
						variant="outline"
						onClick={() => {
							nitroliteAuth.disconnect();
							disconnect.disconnect();
						}}
					>
						Disconnect
					</Button>
				</div>

				{nitroliteAuth.status === "idle" && (
					<Button onClick={nitroliteAuth.connectAndAuthenticate} size="sm">
						Sign & Authenticate
					</Button>
				)}

				{nitroliteAuth.status === "connecting" && (
					<Button disabled size="sm">
						Connecting to ClearNode...
					</Button>
				)}

				{nitroliteAuth.status === "signing" && (
					<Button disabled size="sm">
						Please sign message...
					</Button>
				)}

				{nitroliteAuth.status === "authenticating" && (
					<Button disabled size="sm">
						Authenticating...
					</Button>
				)}

				{nitroliteAuth.status === "authenticated" &&
					nitroliteAuth.sessionKey && (
						<div className="text-xs text-green-600 dark:text-green-400">
							✓ Authenticated (Session:{" "}
							{nitroliteAuth.sessionKey.slice(0, 6)}...
							{nitroliteAuth.sessionKey.slice(-4)})
						</div>
					)}

				{nitroliteAuth.status === "error" && nitroliteAuth.error && (
					<div className="text-xs text-red-600 dark:text-red-400">
						Error: {nitroliteAuth.error}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="flex gap-2">
			{connect.connectors.map((connector) => (
				<Button
					key={connector.uid}
					onClick={() => connect.connect({ connector })}
					disabled={connect.isPending}
				>
					{connect.isPending ? "Connecting..." : `Connect ${connector.name}`}
				</Button>
			))}
		</div>
	);
}
