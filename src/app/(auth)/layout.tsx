import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Link href="/" className="ac-seal" style={{ display: "block", textDecoration: "none" }}>
          अ
        </Link>
        {children}
      </div>
    </div>
  );
}
