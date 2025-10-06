import { http, createConfig, cookieStorage, createStorage } from "wagmi";
import { sepolia } from "wagmi/chains";
import { porto } from "porto/wagmi";

export const config = createConfig({
	chains: [sepolia],
	connectors: [porto()],
	ssr: true,
	storage: createStorage({
		storage: cookieStorage,
	}),
	transports: {
		[sepolia.id]: http(),
	},
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
