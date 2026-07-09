import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePageTitleStore } from "../store/usePageTitleStore";

export function usePublishTitle(title: string | null | undefined) {
  const { pathname } = useLocation();
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle);

  useEffect(() => {
    if (title) setPageTitle(pathname, title);
  }, [pathname, title, setPageTitle]);
}
