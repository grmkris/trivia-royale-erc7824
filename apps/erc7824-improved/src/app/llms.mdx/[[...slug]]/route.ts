import { getLLMText } from '@/lib/source';
import { source } from '@/lib/source';
import { notFound } from 'next/navigation';
import type { NextRequest } from 'next/server';

export const revalidate = false;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug?: string[] }> },
) {
  const params = await context.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: {
      'Content-Type': 'text/markdown',
    },
  });
}

export function generateStaticParams() {
  return source.generateParams();
}
