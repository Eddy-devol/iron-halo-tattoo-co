import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/server/auth";
import AdminBookingsDashboard from "@/components/admin/AdminBookingsDashboard";

export const metadata = { title: "Bookings | Admin" };

export default async function AdminPage() {
  if (!(await getCurrentAdmin())) redirect("/admin/login");
  return <AdminBookingsDashboard />;
}
