import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DesktopCallbackPage() {
  const { sessionId } = await auth();
  const user = await currentUser();

  if (!sessionId || !user) {
    redirect("/sign-in?redirect_url=/auth/desktop/callback");
  }

  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    const deepLinkUrl = `crafter-code://auth/callback?error=${encodeURIComponent("no_token")}`;
    redirect(deepLinkUrl);
  }

  const userData = {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress || "",
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
  };

  const deepLinkUrl = `crafter-code://auth/callback?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(userData))}`;

  return (
    <html lang="en">
      <head>
        <meta httpEquiv="refresh" content={`0;url=${deepLinkUrl}`} />
        <title>Redirecting to Crafter Code...</title>
      </head>
      <body className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-medium">Authentication successful!</h1>
          <p className="text-zinc-400">Redirecting to Crafter Code...</p>
          <p className="text-sm text-zinc-500">
            If the app doesn&apos;t open automatically,{" "}
            <a href={deepLinkUrl} className="text-orange-500 hover:underline">
              click here
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}
