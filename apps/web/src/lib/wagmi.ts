import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { porto } from "porto/wagmi";

export const config = createConfig({
	chains: [baseSepolia],
	connectors: [porto()],
	transports: {
		[baseSepolia.id]: http(),
	},
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
