import PrintPilotClient from "./PrintPilotClient";
import { getAuthenticatedUser } from "./auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ auth_error?: string }> }) {
  const user = await getAuthenticatedUser();
  const authError = (await searchParams).auth_error ?? null;
  return (
    <PrintPilotClient
      user={user ? { displayName: user.displayName, email: user.email } : null}
      authError={authError}
    />
  );
}
