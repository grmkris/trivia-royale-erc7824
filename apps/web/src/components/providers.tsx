"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";
import { config } from "@/lib/wagmi";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";
import { NitroliteProvider } from "@/providers/NitroliteProvider";
import { useState } from "react";

export default function Providers({
	children,
	initialState
}: {
	children: React.ReactNode;
	initialState?: State;
}) {
	const [queryClient] = useState(() => new QueryClient());

	return (
		<WagmiProvider config={config} initialState={initialState}>
			<QueryClientProvider client={queryClient}>
				<NitroliteProvider>
					<ThemeProvider
						attribute="class"
						defaultTheme="system"
						enableSystem
						disableTransitionOnChange
					>
						{children}
						<Toaster richColors />
					</ThemeProvider>
				</NitroliteProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
}
