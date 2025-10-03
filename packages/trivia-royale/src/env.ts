import z from "zod";

export const envSchema = z.object({
  MNEMONIC: z.string({ error: () => `MNEMONIC is required - run \`bun run prepare\` first` }),
});

export const env = envSchema.parse(Bun.env);