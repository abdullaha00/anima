import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The thread section now lives on the one record page. Existing links keep working. */
export default async function Redirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/patient/${id}/record#thread`);
}
