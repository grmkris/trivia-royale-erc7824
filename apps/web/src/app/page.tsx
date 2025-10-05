"use client";

import { ConnectButton } from "@/components/connect-button";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { DepositWithdraw } from "@/components/DepositWithdraw";
import { SendMoney } from "@/components/SendMoney";
import { ChannelInfo } from "@/components/ChannelInfo";
import { useAccount } from "wagmi";

export default function Home() {
	const { isConnected } = useAccount();

	return (
		<div className="container mx-auto max-w-4xl px-4 py-8">
			<div className="mb-8">
				<h1 className="text-3xl font-bold mb-2">ERC7824 Trivia Royale</h1>
				<p className="text-gray-600">State channels powered by Yellow Network</p>
			</div>

			<div className="mb-6 flex justify-between items-center">
				<h2 className="text-xl font-semibold">Wallet Connection</h2>
				<ConnectButton />
			</div>

			{!isConnected ? (
				<div className="p-8 border rounded-lg text-center text-gray-500">
					Connect your wallet to get started
				</div>
			) : (
				<div className="grid gap-6 md:grid-cols-2">
					<div className="space-y-6">
						<BalanceDisplay />
						<ChannelInfo />
					</div>

					<div className="space-y-6">
						<DepositWithdraw />
						<SendMoney />
					</div>
				</div>
			)}
		</div>
	);
}
