import z from "zod";

export const envSchema = z.object({
  MNEMONIC: z.string({ error: () => `MNEMONIC is required - run \`bun run prepare\` first` }).optional(),
  DEBUG: z.string().optional(),
});

export const env = envSchema.parse(Bun.env);

/**
 * Debug logging flag
 * Set DEBUG=true in .env to enable verbose logging
 */
export const DEBUG = env.DEBUG === "true";