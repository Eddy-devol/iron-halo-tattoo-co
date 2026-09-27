import { redirect } from "next/navigation";
import AdminArchiveDashboard from "@/components/admin/AdminArchiveDashboard";
import { getCurrentAdmin } from "@/lib/server/auth";

export const metadata = { title: "Archive | Admin" };

export default async function AdminArchivePage() {
  if (!(await getCurrentAdmin())) redirect("/admin/login");
  return <AdminArchiveDashboard />;
}
