import type { Metadata } from "next";
import { BottomNav } from "@/components/BottomNav";
import { MyReportsList } from "./MyReportsList";

export const metadata: Metadata = { title: "My reports" };

export default function MyReportsPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex flex-1 flex-col gap-4 p-5">
        <h1 className="text-2xl font-bold">My reports</h1>
        <MyReportsList />
      </main>
      <BottomNav active="reports" />
    </div>
  );
}
