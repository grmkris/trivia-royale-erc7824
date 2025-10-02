import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { porto } from "porto/wagmi";

export const config = createConfig({
	chains: [sepolia],
	connectors: [porto()],
	transports: {
		[sepolia.id]: http(),
	},
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
