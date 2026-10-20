import { ChevronRight, Search } from "lucide-react";
import { ProfileAvatar, SubtitleText } from "@/chrome/account-menu/account-menu-parts";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { TOP_GROUPS } from "./groups";
import { SetIcon } from "./set-icon";
import { SECTION_ICONS } from "./section-icons";
import type { SectionId } from "./shared";

type Meta = Record<SectionId, { label: string; sub: string }>;

/** One grouped list per settings heading, in Harbor's own order. */
function sectionsByHeading(): Array<{ heading: string; ids: SectionId[] }> {
  const out: Array<{ heading: string; ids: SectionId[] }> = [];
  for (const group of TOP_GROUPS) {
    const last = out[out.length - 1];
    if (last && last.heading === group.section) last.ids.push(...group.children);
    else out.push({ heading: group.section, ids: [...group.children] });
  }
  return out;
}

const HEADINGS = sectionsByHeading();

function Glyph({ name }: { name: string }) {
  return <SetIcon name={name} size={18} strokeWidth={2.1} />;
}

/**
 * The iOS root of Settings: a large title, the active profile, and Harbor's
 * settings pages as grouped rows. Every row opens the page the desktop
 * sidebar would; nothing here holds state of its own.
 */
export function IosSettingsHome({
  meta,
  onOpen,
  onSearch,
}: {
  meta: Meta;
  onOpen: (id: SectionId) => void;
  onSearch: () => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { user } = useAuth();
  const { activeProfile, profiles } = useProfiles();
  const fallbackAvatar = settings.harborAvatar?.startsWith("/kids/avatars/")
    ? null
    : (settings.harborAvatar ?? null);
  const name =
    activeProfile?.name ?? user?.fullname ?? user?.email?.split("@")[0] ?? t("profile.fallback");

  return (
    <div className="ios-settings" data-ios-settings-home>
      <h1 className="ios-settings-title">{t("Settings")}</h1>
      <button type="button" className="ios-settings-search" onClick={onSearch}>
        <Search size={17} strokeWidth={2.2} aria-hidden />
        <span>{t("Search settings")}</span>
      </button>

      <div className="ios-settings-group">
        <button type="button" className="ios-settings-profile" onClick={() => onOpen("account")}>
          <ProfileAvatar
            profile={activeProfile}
            user={user}
            fallbackAvatar={fallbackAvatar}
            size="lg"
          />
          <span className="ios-settings-row-text">
            <span className="ios-settings-profile-name">{name}</span>
            <span className="ios-settings-row-sub">
              <SubtitleText active={activeProfile} profiles={profiles} user={user} />
            </span>
          </span>
          <ChevronRight size={18} className="ios-settings-chevron dir-icon" aria-hidden />
        </button>
      </div>

      {HEADINGS.map(({ heading, ids }) => (
        <section key={heading} className="ios-settings-section">
          <h2 className="ios-settings-heading">{t(heading)}</h2>
          <div className="ios-settings-group">
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                className="ios-settings-row"
                onClick={() => onOpen(id)}
              >
                <span className="ios-settings-icon" aria-hidden>
                  <Glyph name={SECTION_ICONS[id]} />
                </span>
                <span className="ios-settings-row-text">
                  <span className="ios-settings-row-title">{t(meta[id].label)}</span>
                  <span className="ios-settings-row-sub">{t(meta[id].sub)}</span>
                </span>
                <ChevronRight size={18} className="ios-settings-chevron dir-icon" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      ))}

      <p className="ios-settings-version">
        Harbor {__APP_VERSION__} · {__BUILD_ID__}
      </p>
    </div>
  );
}
