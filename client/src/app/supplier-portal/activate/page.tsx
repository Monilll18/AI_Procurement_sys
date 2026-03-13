import { SupplierActivateContent } from "./activate-content";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams: Promise<{ token?: string; change?: string }>;
};

export default async function SupplierActivatePage({ searchParams }: PageProps) {
    const params = await searchParams;
    const token = params.token || "";
    const isChangePassword = params.change === "1";

    return <SupplierActivateContent token={token} isChangePassword={isChangePassword} />;
}
// build: Fri Mar 13 13:58:01 IST 2026
