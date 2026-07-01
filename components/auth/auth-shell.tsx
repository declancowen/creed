"use client";

// Shared split-screen chrome for the auth surface: an unbranded left column
// (optional top-right link + centred content) and the framed image panel on
// the right. /login, /accept-invite, and /reset-password render inside it so
// they stay visually identical.

import type { ReactNode } from "react";
import { SceneryImage } from "@/components/marketing/scenery-image";

const lightPanelImage = "/assets/landing/scenery/light-auth.png";
const darkPanelImage = "/assets/landing/scenery/dark-auth.png";

export function AuthShell({ topRight, children }: { topRight?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <div className="flex w-full flex-col px-6 py-6 md:w-1/2 md:px-12 md:py-8 lg:px-20">
        {topRight ? <div className="flex items-center justify-end">{topRight}</div> : null}

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>
      </div>

      {/* Image panel (hidden on mobile). No framed card - the page background
          fades over the inner edge so the art blends into the form column. */}
      <div className="relative hidden w-1/2 md:block">
        <SceneryImage
          src={lightPanelImage}
          fileName="light-auth.png"
          label="Light auth"
          priority
          className="dark:hidden"
        />
        <SceneryImage
          src={darkPanelImage}
          fileName="dark-auth.png"
          label="Dark auth"
          hint="portrait"
          className="hidden dark:block"
        />
        {/* Smooth, eased fade from the page bg on the inner (left) edge into
            the image so it melts in rather than cutting off. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "var(--scenery-fade-in-x)" }}
        />
      </div>
    </div>
  );
}
