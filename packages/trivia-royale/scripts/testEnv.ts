import z from "zod";

export const testEnvSchema = z.object({
  MNEMONIC: z.string({ error: () => `MNEMONIC is required - run \`bun run prepare\` first` }).optional(),
  DEBUG: z.string().optional(),
});

export const testEnv = testEnvSchema.parse(Bun.env);

/**
 * Debug logging flag
 * Set DEBUG=true in .env to enable verbose logging
 */
export const DEBUG = testEnv.DEBUG === "true";
