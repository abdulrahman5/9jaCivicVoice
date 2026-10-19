import type { Metadata } from "next";
import { CategorySchema } from "@civicvoice/validation";
import { ReportFlow } from "./ReportFlow";

export const metadata: Metadata = { title: "Report an issue" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const parsed = CategorySchema.safeParse((await searchParams).category);
  return <ReportFlow initialCategory={parsed.success ? parsed.data : undefined} />;
}
