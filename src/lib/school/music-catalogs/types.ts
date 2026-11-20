export type MusicCatalogProvider = "YouTube" | "SoundCloud" | "Jamendo" | "Internet Archive";

export type MusicCatalogResult = {
  provider: MusicCatalogProvider;
  id: string;
  title: string;
  artist: string;
  genre: string;
  playbackUrl: string;
  artworkUrl: string;
  sourcePageUrl: string;
  credit: string;
  licenseName: string;
  licenseUrl: string;
};
