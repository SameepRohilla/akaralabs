import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import GoogleButton from "@/components/GoogleButton";
import SignUpForm from "./SignUpForm";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Create an Akara Labs account to track your prototyping and 3D-printing requests, approve quotes and keep your CAD files in one place.",
  robots: { index: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; ref?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/dashboard";
  if (session?.user) redirect(next);

  return (
    <>
      <h1>Create your account.</h1>
      <p className="ac-sub">
        Track every request end to end, approve quotes, and keep your models on file for reorders.
      </p>

      <GoogleButton next={next} />

      <div className="auth-divider">or</div>

      <SignUpForm next={next} presetEmail={sp.email} referral={sp.ref} />

      <p className="auth-foot">
        Already have an account? <Link href={`/signin?next=${encodeURIComponent(next)}`}>Sign in</Link>
      </p>
    </>
  );
}
