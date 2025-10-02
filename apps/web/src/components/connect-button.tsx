"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "./ui/button";

export function ConnectButton() {
	const { address, isConnected } = useAccount();
	const { connect, connectors, isPending } = useConnect();
	const { disconnect } = useDisconnect();

	if (isConnected && address) {
		return (
			<div className="flex items-center gap-2">
				<span className="text-sm">
					{address.slice(0, 6)}...{address.slice(-4)}
				</span>
				<Button variant="outline" onClick={() => disconnect()}>
					Disconnect
				</Button>
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
