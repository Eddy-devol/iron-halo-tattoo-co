import { redirect } from "next/navigation";
import AdminArtistForm from "@/components/admin/AdminArtistForm";
import { getCurrentAdmin } from "@/lib/server/auth";

export const metadata = { title: "Add artist | Admin" };

export default async function NewArtistPage() {
  if (!(await getCurrentAdmin())) redirect("/admin/login");
  return <AdminArtistForm />;
}
