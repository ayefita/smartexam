import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function HistoryPage() {
  const user = await requireUser(["candidate"]);
  redirect(`/reports/candidates/${user.id}`);
}
