import { useEffect, useRef, useState, type ReactNode } from "react";
import { Compass, House, LibraryBig, Search } from "lucide-react";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useParental, type LockableTab } from "@/lib/parental";
import { useProfiles } from "@/lib/profiles";
import { useSearchActions, useSearchOpen } from "@/lib/search-context";
import { useSettings } from "@/lib/settings";
import { useView, type View } from "@/lib/view";
import { ProfileAvatar } from "./account-menu/account-menu-parts";

export type IosTab = "home" | "discover" | "search" | "library" | "profile";

const ROOT_VIEW: Record<Exclude<IosTab, "search">, View> = {
  home: "home",
  discover: "discover",
  library: "library",
  profile: "settings",
};

const LOCK: Partial<Record<IosTab, LockableTab>> = { discover: "discover" };

/** The section a view belongs to, so a detail page keeps its tab lit. */
function tabForView(view: View): IosTab | null {
  if (view === "home" || view === "movies" || view === "shows" || view === "anime") return "home";
  if (view === "discover" || view === "catalogs" || view === "calendar" || view === "people")
    return "discover";
  if (view === "library" || view === "collections-hub" || view === "downloads") return "library";
  if (view === "settings" || view === "addons") return "profile";
  return null;
}

/**
 * Floating bottom navigation for iPhone and iPad. Replaces the desktop
 * sidebar/topbar; every tab is a real Harbor view or the global search.
 */
export function IosTabBar({ hidden }: { hidden: boolean }) {
  const t = useT();
  const { view, setView } = useView();
  const searchOpen = useSearchOpen();
  const { setOpen: setSearchOpen } = useSearchActions();
  const { locked, unlock, hiddenTabs } = useParental();
  const [pinFor, setPinFor] = useState<IosTab | null>(null);
  const lastTab = useRef<IosTab>("home");

  const sectionTab = tabForView(view);
  if (sectionTab) lastTab.current = sectionTab;
  const active: IosTab = searchOpen ? "search" : (sectionTab ?? lastTab.current);

  const go = (tab: IosTab) => {
    if (tab === "search") {
      setSearchOpen(!searchOpen);
      return;
    }
    const lock = LOCK[tab];
    if (lock && locked && hiddenTabs[lock]) {
      setPinFor(tab);
      return;
    }
    if (searchOpen) setSearchOpen(false);
    // Tapping the current tab from a pushed page pops back to its root, the
    // same as UITabBarController; on the root it re-runs the view's reset.
    setView(ROOT_VIEW[tab]);
  };

  return (
    <>
      <nav
        aria-label={t("Navigation")}
        aria-hidden={hidden || undefined}
        data-ios-tabbar
        data-hidden={hidden ? "" : undefined}
        className="ios-tabbar"
      >
        <div className="ios-tabbar-track" role="tablist">
          <TabButton
            label={t("nav.home")}
            active={active === "home"}
            onPress={() => go("home")}
            icon={<House size={22} strokeWidth={active === "home" ? 2.3 : 1.8} />}
          />
          <TabButton
            label={t("nav.discover")}
            active={active === "discover"}
            onPress={() => go("discover")}
            icon={<Compass size={22} strokeWidth={active === "discover" ? 2.3 : 1.8} />}
          />
          <TabButton
            label={t("Search")}
            active={active === "search"}
            onPress={() => go("search")}
            icon={<Search size={22} strokeWidth={active === "search" ? 2.4 : 1.9} />}
          />
          <TabButton
            label={t("Library")}
            active={active === "library"}
            onPress={() => go("library")}
            icon={<LibraryBig size={22} strokeWidth={active === "library" ? 2.3 : 1.8} />}
          />
          <TabButton
            label={t("Profile")}
            active={active === "profile"}
            onPress={() => go("profile")}
            icon={<TabAvatar active={active === "profile"} />}
          />
        </div>
      </nav>
      {pinFor !== null && (
        <ParentalPinModal
          mode={{
            kind: "unlock",
            onUnlock: () => {
              const tab = pinFor;
              setPinFor(null);
              if (tab && tab !== "search") setView(ROOT_VIEW[tab]);
            },
            onCancel: () => setPinFor(null),
          }}
          verify={unlock}
        />
      )}
    </>
  );
}

function TabButton({
  label,
  active,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      data-active={active ? "" : undefined}
      className="ios-tab"
      onClick={onPress}
    >
      <span className="ios-tab-icon" aria-hidden>
        {icon}
      </span>
      <span className="ios-tab-label">{label}</span>
    </button>
  );
}

function TabAvatar({ active }: { active: boolean }) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const { activeProfile } = useProfiles();
  const fallback = settings.harborAvatar?.startsWith("/kids/avatars/")
    ? null
    : (settings.harborAvatar ?? null);
  return (
    <span className={`ios-tab-avatar${active ? " is-active" : ""}`}>
      <ProfileAvatar profile={activeProfile} user={user} fallbackAvatar={fallback} size="sm" />
    </span>
  );
}

/** Keeps `--ios-tabbar-space` in sync so scroll views can pad past the bar. */
export function useIosTabBarSpace(visible: boolean): void {
  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.dataset.iosTabbar = "";
    else delete root.dataset.iosTabbar;
    return () => {
      delete root.dataset.iosTabbar;
    };
  }, [visible]);
}
