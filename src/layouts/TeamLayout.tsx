import React, { ReactNode } from "react";

export function TeamLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}

export default TeamLayout;
