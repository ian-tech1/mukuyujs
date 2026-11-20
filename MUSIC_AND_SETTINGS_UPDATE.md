# Music Studio and Advanced Settings Update

This source-only update extends the existing Super Admin Music Studio and staff music dock. It keeps the existing portal, authentication, school records, and old single-URL/playlist settings intact; no database migration is required.

## In-page playback

Direct HTTPS audio streams and browser-playable uploaded audio remain in the native player. A source resolver also recognizes official YouTube, Spotify, SoundCloud, Apple Music, Mixcloud, Deezer, and TIDAL share links and renders supported players inside the portal. Tracks from different providers may coexist in one playlist. Provider links use their provider's embedded player, not a redirect or a downloaded/extracted stream. Signed-in teachers, administrators, students, and parents can use the configured portal player; anonymous visitors do not receive the private playlist configuration. YouTube documents iframe players for videos and playlists; Spotify offers interactive embeds; SoundCloud offers an embedded widget and widget API [1] [2] [3].

Each track may include a direct fallback URL. For native direct-audio sources, if the primary source fails, the dock retries according to its settings and then tries the fallback without leaving the portal. For provider embeds, staff can switch to the configured backup manually because cross-origin player failures are not reliably observable. Provider iframes own their internal error, end-of-track, and volume controls; the portal cannot reliably observe all provider events. Admins can import/export playlist JSON and preview direct sources or provider embeds before publishing. Uploaded files accept browser-recognized `audio/*` MIME types under the existing 500 KB size limit; actual codec playback depends on the visitor's browser.

## Ten additional advanced capabilities

1. Auto-detect supported provider share links and render provider players in-page.
2. Mix supported provider items and direct audio sources in one playlist.
3. Set a per-track fallback source for failed direct streams.
4. Export the configured playlist and playback options as JSON.
5. Import a playlist from a JSON file.
6. Preview/test a configured source in the Settings page before publishing.
7. Accept a wider set of browser-recognized uploaded `audio/*` media types.
8. Configure failed-source retry count (0–3) and retry delay (0–5 seconds).
9. Choose media preloading: none, metadata, or browser-default automatic loading.
10. Remember native-audio volume on the current device, separately from the centrally configured default.

The original ten settings remain: default volume, playback speed, shuffle, repeat mode, remember track, auto-next, compact layout, player position, queue visibility, and retry enablement.

## Limits

No browser player can guarantee every codec, protected/DRM service, private API, expiring token, or provider's regional/account availability. Provider embeds remain subject to the provider's terms and browser policies. A provider API key by itself does not make a protected catalogue playable: playback still needs that service's permitted embedded player or an authorized browser-playable media URL. Browsers may require the staff member to press Play, and cross-origin or hotlink restrictions may block direct streams. Only use sources the school is authorized to play.

## Live radio

The portal player includes a **Live radio** button that searches the free Radio Browser directory without an API key, dynamically discovers API hosts, and retries fallback hosts if one is unavailable [4] [5]. Search defaults to Kenya and supports other countries or a worldwide search. The player filters for checked HTTPS non-HLS station streams and plays the station in the portal's native audio element. Press Play to start; browser autoplay policies require a user gesture. The station directory is community-maintained and can be temporarily unavailable, and station streams may still be geoblocked, unsupported by a device, or taken offline. The API is free but provided without uptime guarantees [4] [5].

## Spotify catalog search

Music Studio adds an optional, Super Admin-only Spotify track search. It searches up to ten matching tracks in the Kenya market, lets the administrator add a selected Spotify share URL to the existing playlist, and plays that selection through Spotify's official in-page Embed player [2]. Catalog search uses Spotify's server-to-server Client Credentials flow; `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` must be set as **server-only deployment secrets**. They are never sent to the browser or stored in the project ZIP. Without those deployment secrets, the existing Spotify share-link/embed path still works, but catalog search displays a configuration message. Spotify's current Development Mode rules can restrict who may register/use an app and which accounts can access the API [8] [9].

Spotify embeds are interactive provider players, not unrestricted direct audio URLs: a listener may need to press Play and availability/account/device restrictions still apply. This update does not use the Spotify Web Playback SDK to start a shared school-wide stream; Spotify documents that SDK as requiring an access token from a Spotify Premium user and states that Spotify content may not be broadcast [7]. API credentials enable catalog search, not universal full-track playback [6] [7].

## Non-Spotify catalog search and tap-to-play

Music Studio now has a Super Admin-only provider catalog picker for Jamendo, YouTube, and SoundCloud, in addition to existing direct URL entry and official provider embeds. The existing portal Live radio directory remains available without credentials. Search requests run server-side and are capped at ten results. Optional search settings are `JAMENDO_CLIENT_ID`, `YOUTUBE_API_KEY`, `SOUNDCLOUD_CLIENT_ID`, and `SOUNDCLOUD_CLIENT_SECRET`; they are read only by server functions and are not bundled into the browser or project archive. If a search key is not configured, staff can still paste known YouTube or SoundCloud share URLs, which are played by the providers' official in-page players.

YouTube search filters for embeddable videos and adds the official watch link to the in-page iframe player [1] [10]. SoundCloud catalog results are added as public SoundCloud links and use the official widget, subject to app access and track embed/region restrictions [3] [11] [12]. Jamendo results use the API-provided HTTPS audio URL in the native player and retain creator credit, Jamendo source-page link, and the track's Creative Commons license link/name in the playlist and portal dock. Jamendo's API terms allow free non-commercial use; each selected track license must be checked, and the site must credit the artist/Jamendo and link to the content page [13] [14]. Confirm the school's use is non-commercial and complies with the individual license before adding a track.

The dock's explicit Play/Pause button calls the browser audio `play()`/`pause()` methods for direct audio, Jamendo tracks, and live radio. Tapping a station result requests immediate playback; if a browser blocks the request, the native audio Play control remains available. Cross-origin provider embeds (including YouTube, SoundCloud, and Spotify) must be started using the Play control inside the official embedded player; the page cannot override provider account/DRM/region rules or guarantee autoplay. No API key enables unrestricted playback of every song.

## References

[1]: https://developers.google.com/youtube/player_parameters "YouTube Embedded Players and Player Parameters"
[2]: https://developer.spotify.com/documentation/embeds "Spotify Embeds"
[3]: https://developers.soundcloud.com/docs/api/html5-widget "SoundCloud Widget API"
[4]: https://api.radio-browser.info/ "Radio Browser API documentation and server discovery"
[5]: https://docs.radio-browser.info/ "Radio Browser station search and stream fields"
[6]: https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow "Spotify Web API Client Credentials flow"
[7]: https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started "Spotify Web Playback SDK requirements and policy notes"
[8]: https://developer.spotify.com/documentation/web-api/references/changes/february-2026 "Spotify Web API February 2026 endpoint changes"
[9]: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide "Spotify Developer Mode migration guide"
[10]: https://developers.google.com/youtube/data/getting-started "YouTube Data API setup and quota"
[11]: https://developers.soundcloud.com/docs/api/guide "SoundCloud API guide and Client Credentials flow"
[12]: https://developers.soundcloud.com/docs/api/explorer/open-api "SoundCloud public API search reference"
[13]: https://devportal.jamendo.com/api_terms_of_use "Jamendo API terms, licensing and attribution"
[14]: https://developer.jamendo.com/v3.0/tracks "Jamendo tracks API"
