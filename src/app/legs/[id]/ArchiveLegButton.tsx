"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ArchiveLegButton({
  legId,
  status,
}: {
  legId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (status !== "active") return null;

  async function archive() {
    if (!confirm("Archive this leg? It will stop being tracked.")) return;
    setLoading(true);
    await fetch(`/api/legs/${legId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={archive}
      disabled={loading}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      {loading ? "Archiving…" : "Archive leg"}
    </button>
  );
}
