import { notFound } from "next/navigation";
import { db } from "@/db";
import { legs } from "@/db/schema";
import { eq } from "drizzle-orm";
import EditLegForm from "./EditLegForm";

export default async function EditLegPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [leg] = await db.select().from(legs).where(eq(legs.id, id)).limit(1);
  if (!leg) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <a href={`/legs/${id}`} className="text-blue-600 text-sm hover:underline">
          ← Back
        </a>
        <h1 className="text-lg font-semibold text-gray-900 mt-1">Edit leg</h1>
      </header>
      <main className="px-4 py-6 sm:px-6 sm:py-8 max-w-xl mx-auto">
        <EditLegForm leg={leg} />
      </main>
    </div>
  );
}
