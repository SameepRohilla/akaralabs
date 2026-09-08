"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      className="side-link"
      style={{ width: "100%", background: "none", border: 0, cursor: "pointer", font: "inherit", textAlign: "left" }}
      onClick={() => signOut({ redirectTo: "/" })}
    >
      <span className="sl-icon" aria-hidden="true">
        ⏻
      </span>
      Sign out
    </button>
  );
}
