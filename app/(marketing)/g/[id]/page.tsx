import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadGradeCard } from '@/lib/forge/grade-cards';
import { GradeCardView } from './grade-card-view';

const BASE_URL = 'https://forgeyourway.dev';

export const revalidate = 86400;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const card = await loadGradeCard(params.id);
  if (!card) return { title: 'Grade not found | Forge' };
  const title = `This hook scored ${card.score}/50 | Forge`;
  const description = `"${card.hook.slice(0, 140)}" ${card.verdict}. Graded on five dimensions by Forge's Stop-Scroll Grader.`;
  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/g/${card.id}` },
    openGraph: { title, description, url: `${BASE_URL}/g/${card.id}`, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: false, follow: true },
  };
}

export default async function GradeCardPage({ params }: { params: { id: string } }) {
  const card = await loadGradeCard(params.id);
  if (!card) notFound();
  return <GradeCardView card={card} />;
}
