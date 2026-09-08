import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import GoogleButton from "@/components/GoogleButton";
import SignInForm from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to track your Akara Labs projects, approve quotes and message the studio.",
  robots: { index: false },
};

const ERRORS: Record<string, string> = {
  CredentialsSignin: "That email and password don't match. Try again, or reset your password.",
  OAuthAccountNotLinked:
    "You first signed up with a password. Sign in that way, then link Google from Settings.",
  AccessDenied: "That sign-in was declined.",
  Configuration: "Sign-in isn't configured correctly. Please let us know.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; registered?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/dashboard";

  if (session?.user) redirect(next);

  const error = sp.error ? ERRORS[sp.error] || "We couldn't sign you in. Please try again." : null;

  return (
    <>
      <h1>Welcome back.</h1>
      <p className="ac-sub">Your projects, quotes and files — all in one place.</p>

      {sp.registered ? (
        <div className="notice notice-ok" style={{ marginBottom: 18 }}>
          Account created. Check your inbox for a verification link, then sign in.
        </div>
      ) : null}
      {error ? (
        <div className="notice notice-err" style={{ marginBottom: 18 }}>
          {error}
        </div>
      ) : null}

      <GoogleButton next={next} />

      <div className="auth-divider">or</div>

      <SignInForm next={next} />

      <p className="auth-foot">
        New here? <Link href={`/signup${sp.next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link>
        <br />
        <Link href="/forgot" style={{ fontSize: 13 }}>
          Forgot your password?
        </Link>
      </p>
      <p className="auth-foot" style={{ marginTop: 14, fontSize: 13 }}>
        Just want to check on an order?{" "}
        <Link href="/track/">Track it without signing in</Link>
      </p>
    </>
  );
}
