import { redirect } from "next/navigation";
import AdminArchiveArtworkForm from "@/components/admin/AdminArchiveArtworkForm";
import { getCurrentAdmin } from "@/lib/server/auth";

export const metadata = { title: "Add artwork | Admin" };

export default async function NewArchiveArtworkPage() {
  if (!(await getCurrentAdmin())) redirect("/admin/login");
  return <AdminArchiveArtworkForm />;
}
