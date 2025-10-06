"use client";

import { WalletHeader } from "@/components/WalletHeader";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { DepositWithdraw } from "@/components/DepositWithdraw";
import { SendMoney } from "@/components/SendMoney";
import { ChannelInfo } from "@/components/ChannelInfo";
import { TriviaGame } from "@/components/TriviaGame";
import { useAccount } from "wagmi";
import { useNitrolite } from "@/providers/NitroliteProvider";
import { Button } from "@/components/ui/button";

export default function Home() {
	const { isConnected } = useAccount();
	const { status, connect } = useNitrolite();

	return (
		<div className="container mx-auto max-w-2xl px-4 py-6 min-h-screen">
			<WalletHeader />

			{!isConnected ? (
				<div className="p-12 border rounded-lg text-center text-muted-foreground">
					Connect your wallet to get started
				</div>
			) : status === 'disconnected' ? (
				<div className="relative">
					{/* Blurred content */}
					<div className="space-y-4 blur-sm pointer-events-none select-none">
						<BalanceDisplay />
						<TriviaGame />
						<div className="grid gap-3 sm:grid-cols-2">
							<DepositWithdraw />
							<SendMoney />
						</div>
						<ChannelInfo />
					</div>

					{/* Authenticate overlay */}
					<div className="absolute inset-0 flex items-center justify-center">
						<Button
							onClick={connect}
							size="lg"
							className="shadow-lg"
						>
							Authenticate
						</Button>
					</div>
				</div>
			) : status === 'connecting' ? (
				<div className="relative">
					{/* Blurred content */}
					<div className="space-y-4 blur-sm pointer-events-none select-none">
						<BalanceDisplay />
						<TriviaGame />
						<div className="grid gap-3 sm:grid-cols-2">
							<DepositWithdraw />
							<SendMoney />
						</div>
						<ChannelInfo />
					</div>

					{/* Connecting overlay */}
					<div className="absolute inset-0 flex items-center justify-center">
						<Button
							disabled
							size="lg"
							className="shadow-lg"
						>
							Connecting...
						</Button>
					</div>
				</div>
			) : (
				<div className="space-y-4">
					<BalanceDisplay />

					{/* Trivia Game - Featured */}
					<TriviaGame />

					<div className="grid gap-3 sm:grid-cols-2">
						<DepositWithdraw />
						<SendMoney />
					</div>

					<ChannelInfo />
				</div>
			)}
		</div>
	);
}
