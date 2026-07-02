"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteLegButton({ legId }: { legId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function deleteLeg() {
    if (!confirm("Permanently delete this leg and all its price history? This cannot be undone.")) return;
    setLoading(true);
    await fetch(`/api/legs/${legId}`, { method: "DELETE" });
    router.push("/archive");
    router.refresh();
  }

  return (
    <button
      onClick={deleteLeg}
      disabled={loading}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      {loading ? "Deleting…" : "Delete leg"}
    </button>
  );
}
