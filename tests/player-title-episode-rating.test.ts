// @ts-expect-error Node test types are outside the browser tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are outside the browser tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are outside the browser tsconfig.
import test from "node:test";
import ts from "typescript";

function load() {
  const mocks: Record<string, unknown> = {
    react: {},
    "@/lib/series-episodes": {
      isAnimeId: (id: string) => id.startsWith("kitsu:"),
      animeSeriesFromStreamId: (id: string | undefined) => (id ? "kitsu:base" : undefined),
    },
    "@/lib/providers/harbor-imdb": {},
  };
  const source = readFileSync(
    new URL("../src/components/player/episode-panel/use-imdb-episode-ratings.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency: ${id}`);
    return mocks[id];
  }, exports);
  return exports;
}

const { resolveEpisodeRating, episodeRatingsMeta } = load();

test("player title prefers the IMDb episode rating", () => {
  assert.deepEqual(resolveEpisodeRating({ season: 5, episode: 11, rating: 7.1 }, 8.4), {
    value: 8.4,
    isImdb: true,
  });
});

test("player title falls back to the TMDB episode rating", () => {
  assert.deepEqual(resolveEpisodeRating({ season: 5, episode: 11, rating: 7.1 }, undefined), {
    value: 7.1,
    isImdb: false,
  });
  assert.deepEqual(resolveEpisodeRating({ season: 5, episode: 11, rating: 7.1 }, 0), {
    value: 7.1,
    isImdb: false,
  });
});

test("player title hides the rating when none is known", () => {
  assert.equal(resolveEpisodeRating({ season: 1, episode: 1 }, undefined), null);
  assert.equal(resolveEpisodeRating({ season: 1, episode: 1, rating: 0 }, 0), null);
});

test("anime episodes look up ratings under their base series", () => {
  const series = { id: "tt0000001", type: "series" };
  assert.equal(episodeRatingsMeta(series, "kitsu:1:2"), series);
  assert.equal(episodeRatingsMeta({ id: "kitsu:1", type: "series" }, "kitsu:1:2").id, "kitsu:base");
  assert.equal(episodeRatingsMeta({ id: "kitsu:1", type: "series" }, undefined).id, "kitsu:1");
});
