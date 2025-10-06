"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "./ui/button";
import { ModeToggle } from "./mode-toggle";
import { useNitrolite } from "@/providers/NitroliteProvider";
import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function WalletHeader() {
	const account = useAccount();
	const connect = useConnect();
	const disconnect = useDisconnect();
	const { status } = useNitrolite();
	const [copied, setCopied] = useState(false);

	const copyAddress = async () => {
		if (account.address) {
			await navigator.clipboard.writeText(account.address);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	if (!account.isConnected) {
		return (
			<div className="flex justify-between items-center mb-6">
				<div className="flex gap-2">
					{connect.connectors.map((connector) => (
						<Button
							key={connector.uid}
							onClick={() => connect.connect({ connector })}
							disabled={connect.isPending}
						>
							{connect.isPending ? "Connecting..." : `Connect Wallet`}
						</Button>
					))}
				</div>
				<ModeToggle />
			</div>
		);
	}

	const statusColors = {
		connected: 'bg-green-500',
		connecting: 'bg-yellow-500',
		disconnected: 'bg-gray-400',
		error: 'bg-red-500'
	};

	const statusLabels = {
		connected: 'Connected',
		connecting: 'Connecting...',
		disconnected: 'Disconnected',
		error: 'Connection Error'
	};

	return (
		<div className="mb-6 space-y-3">
			{/* ClearNode URL */}
			<div className="text-xs text-muted-foreground font-mono">
				ClearNode: ws://localhost:8000/ws
			</div>

			{/* Wallet & Status */}
			<div className="flex justify-between items-start">
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<span className="text-sm font-mono text-muted-foreground">
							{account.address?.slice(0, 10)}...{account.address?.slice(-8)}
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={copyAddress}
						>
							{copied ? (
								<Check className="h-3.5 w-3.5" />
							) : (
								<Copy className="h-3.5 w-3.5" />
							)}
						</Button>

						{/* Connection Status Indicator */}
						<div className="flex items-center gap-1.5 text-xs">
							<div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
							<span className="text-muted-foreground">{statusLabels[status]}</span>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => disconnect.disconnect()}
					>
						Disconnect
					</Button>
					<ModeToggle />
				</div>
			</div>
		</div>
	);
}
