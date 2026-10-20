type SearchDestination = {
  label: string;
  section: string;
  tab?: string;
  anchorTitle?: string;
};

// Match the destinations hidden by the iOS panels. Keep shared pages (for
// example Updates' backup controls and Advanced's privacy controls) searchable.
export function iosSettingsOptionVisible(option: SearchDestination): boolean {
  if (option.section === "theme" && option.tab === "window") return false;
  if (option.section === "anime" && option.tab === "svp") return false;
  if (
    option.section === "advanced" &&
    ["Window behavior", "Discord Rich Presence", "Graphics"].includes(option.anchorTitle ?? "")
  ) return false;
  if (
    option.section === "updates" &&
    ["Updates", "Experimental builds"].includes(option.anchorTitle ?? "")
  ) return false;
  if (option.anchorTitle === "Picture in picture style") return false;
  if (option.section === "bigPicture" && option.label === "Big Picture display") return false;
  if (
    option.section === "player" &&
    (option.anchorTitle === "Casting" ||
      [
        "Embed mpv inside Harbor window",
        "Separate window display",
        "Cover the taskbar",
        "True HDR, separate window",
      ].includes(option.label))
  ) return false;
  return true;
}
