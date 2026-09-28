import { redirect } from "next/navigation";
import AdminArtistsDashboard from "@/components/admin/AdminArtistsDashboard";
import { getCurrentAdmin } from "@/lib/server/auth";

export const metadata = { title: "Artists | Admin" };

export default async function AdminArtistsPage() {
  if (!(await getCurrentAdmin())) redirect("/admin/login");
  return <AdminArtistsDashboard />;
}
