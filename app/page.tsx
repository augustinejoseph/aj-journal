import { auth, signIn, signOut } from "@/auth";
import { allowed } from "@/lib/access";
import Diary from "@/components/diary";
export const dynamic = "force-dynamic";
export default async function Page() {
  const missingConfig = [
    ["AUTH_GOOGLE_ID", process.env.AUTH_GOOGLE_ID],
    ["AUTH_GOOGLE_SECRET", process.env.AUTH_GOOGLE_SECRET],
    ["AUTH_SECRET", process.env.AUTH_SECRET],
    ["ALLOWED_EMAIL", process.env.ALLOWED_EMAIL],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  const configured = missingConfig.length === 0;
  const session = configured ? await auth() : null;
  if (!allowed(session?.user?.email, process.env.ALLOWED_EMAIL))
    return (
      <main className="login">
        <div className="wordmark">
          still<span> / a private diary</span>
        </div>
        <div className="login-card">
          <div className="eyebrow">A LITTLE ROOM FOR YOUR THOUGHTS</div>
          <h1>Say it as it comes.</h1>
          <p>Your voice, your memories. A quiet place to keep them.</p>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button className="button primary" disabled={!configured}>
              Continue with Google <span>↗</span>
            </button>
          </form>
          <small>
            {configured
              ? "Only your configured Google account can enter."
              : `Set ${missingConfig.join(", ")} in .env to open your private diary.`}
          </small>
        </div>
        <span className="login-note">
          Made for the everyday. Kept just for you.
        </span>
      </main>
    );
  return (
    <Diary
      email={session?.user?.email || ""}
      logout={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    />
  );
}
