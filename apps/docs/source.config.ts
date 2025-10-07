import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from 'fumadocs-mdx/config';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';
import { remarkAutoTypeTable, createGenerator } from 'fumadocs-typescript';
import { transformerTwoslash } from 'fumadocs-twoslash';
import { createFileSystemTypesCache } from 'fumadocs-twoslash/cache-fs';

// Create TypeScript generator for auto type tables
const generator = createGenerator();

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
  docs: {
    schema: frontmatterSchema,
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      remarkMdxMermaid,
      [remarkAutoTypeTable, { generator }]
    ],
    rehypeCodeOptions: {
      langs: ['javascript', 'typescript', 'tsx', 'jsx', 'json', 'bash', 'shell'],
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash({
          typesCache: createFileSystemTypesCache(),
          explicitTrigger: true, // Only run on explicitly marked twoslash blocks
        }),
      ],
    },
  },
});
