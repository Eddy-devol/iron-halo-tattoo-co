import { redirect } from "next/navigation";
import AdminBookingDetail from "@/components/admin/AdminBookingDetail";
import { getCurrentAdmin } from "@/lib/server/auth";

export const metadata = { title: "Booking details | Admin" };

export default async function AdminBookingPage({ params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) redirect("/admin/login");
  return <AdminBookingDetail bookingId={params.id} />;
}
