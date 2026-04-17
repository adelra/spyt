export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  durationMs: number;
  url: string;
}

export interface YouTubePlaylist {
  id: string;
  title: string;
  url: string;
}

export interface YTMusicHeaders {
  cookie: string;
  sapisid: string;
  storedAt: number;
}
