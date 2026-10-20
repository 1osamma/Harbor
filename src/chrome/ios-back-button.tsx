import { ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { useFloatingBackShown } from "./floating-back";

/**
 * The iOS navigation-bar back control: a round glass button pinned under the
 * status bar, shown on the same pushed pages that get the desktop floating back.
 */
export function IosBackButton({ hidden }: { hidden: boolean }) {
  const t = useT();
  const { goBack } = useView();
  const shown = useFloatingBackShown();
  if (!shown || hidden) return null;
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={t("common.back")}
      data-floating-back
      className="ios-back-button"
    >
      <ChevronLeft size={24} strokeWidth={2.4} className="dir-icon" />
    </button>
  );
}
