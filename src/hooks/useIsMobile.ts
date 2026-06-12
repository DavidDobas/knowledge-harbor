"use client";

import { useEffect, useState } from "react";
import { MOBILE_BREAKPOINT } from "@/lib/layout";

export function useIsMobile() {
  const [state, setState] = useState({ mounted: false, isMobile: false });

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => setState({ mounted: true, isMobile: mq.matches });
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return state;
}
