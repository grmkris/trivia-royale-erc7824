import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../index.css";
import Providers from "@/components/providers";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { config } from "@/lib/wagmi";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "trivia-royale",
	description: "trivia-royale",
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const initialState = cookieToInitialState(
		config,
		(await headers()).get("cookie")
	);

	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<Providers initialState={initialState}>
					{children}
				</Providers>
			</body>
		</html>
	);
}
