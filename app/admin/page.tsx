import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/server/auth";
import AdminBookingsDashboard from "@/components/admin/AdminBookingsDashboard";

export const metadata = { title: "Studio admin" };

export default async function AdminPage() {
  if (!(await getCurrentAdmin())) redirect("/admin/login");
  return <AdminBookingsDashboard />;
}
