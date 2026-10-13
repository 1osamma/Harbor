import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { EpisodeRating } from "@/lib/player-shells/types";
import { animeSeriesFromStreamId, isAnimeId } from "@/lib/series-episodes";
import { harborImdbEpisodes, harborImdbEpisodesCached } from "@/lib/providers/harbor-imdb";
import type { PlayEpisode } from "@/lib/view";

const EMPTY_RATINGS: Map<string, number> = new Map();

export function episodeRatingsMeta(meta: Meta, kitsuStreamId: string | undefined): Meta {
  if (!isAnimeId(meta.id)) return meta;
  const base = animeSeriesFromStreamId(kitsuStreamId);
  return base && base !== meta.id ? { ...meta, id: base } : meta;
}

export function useImdbEpisodeRatings(seriesId: string, enabled: boolean): Map<string, number> {
  const [loaded, setLoaded] = useState<{ id: string; ratings: Map<string, number> } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void harborImdbEpisodes(seriesId).then((ratings) => {
      if (!cancelled) setLoaded({ id: seriesId, ratings });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, seriesId]);

  if (!enabled) return EMPTY_RATINGS;
  // Ignore the previous series' ratings until this one resolves, so they never bleed across.
  if (loaded?.id === seriesId) return loaded.ratings;
  return harborImdbEpisodesCached(seriesId) ?? EMPTY_RATINGS;
}

export function resolveEpisodeRating(
  episode: PlayEpisode,
  imdbRating: number | undefined,
): EpisodeRating | null {
  if (imdbRating != null && imdbRating > 0) return { value: imdbRating, isImdb: true };
  if (episode.rating != null && episode.rating > 0) return { value: episode.rating, isImdb: false };
  return null;
}

export function useCurrentEpisodeRating(
  meta: Meta | undefined,
  episode: PlayEpisode | undefined,
  enabled: boolean,
): EpisodeRating | null {
  const kitsuStreamId = episode?.kitsuStreamId;
  const seriesId = useMemo(
    () => (meta ? episodeRatingsMeta(meta, kitsuStreamId).id : ""),
    [meta, kitsuStreamId],
  );
  const ratings = useImdbEpisodeRatings(seriesId, enabled && !!episode);
  if (!enabled || !episode) return null;
  return resolveEpisodeRating(episode, ratings.get(`${episode.season}:${episode.episode}`));
}
