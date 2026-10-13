import type { EpisodeRating } from "@/lib/player-shells/types";
import { EpisodeRatingBadge } from "@/views/detail/episode-rating-badge";

export function TitleEpisodeRating({ rating }: { rating?: EpisodeRating | null }) {
  if (!rating) return null;
  return (
    <span className="ms-1 inline-flex shrink-0 items-center gap-1 align-middle">
      <span aria-hidden className="me-0.5">
        ·
      </span>
      <EpisodeRatingBadge value={rating.value} isImdb={rating.isImdb} />
    </span>
  );
}
