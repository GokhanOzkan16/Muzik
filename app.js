(() => {
  const STORAGE_KEY = 'gokhan_playlist_v4';
  const LEGACY_KEYS = ['gokhan_playlist_v3', 'gokhan_playlist_v2'];

  const state = {
    playlist: [],
    currentIndex: -1,
    ytPlayer: null,
    ytReadyPromise: null,
    ytTick: null
  };

  const byId = (id) => document.getElementById(id);

  const safeId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const formatTime = (sec) => {
    if (!Number.isFinite(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const normalizeTrack = (raw, i = 0) => {
    if (!raw || typeof raw !== 'object') return null;

    const type = raw.type === 'youtube' ? 'youtube' : raw.type === 'audio_url' ? 'audio_url' : 'audio_local';
    const id = raw.id || safeId();
    let name = typeof raw.name === 'string' ? raw.name.trim() : '';

    if (type === 'youtube' && !raw.videoId) return null;
    if (type === 'audio_local' && !raw.dataUrl) return null;
    if (type === 'audio_url' && !raw.url) return null;

    if (!name) {
      if (type === 'youtube') name = `YouTube Track ${i + 1}`;
      else if (type === 'audio_url') name = extractNameFromUrl(raw.url) || `Online Track ${i + 1}`;
      else name = `MP3 Track ${i + 1}`;
    }

    return {
      id,
      type,
      name,
      dataUrl: raw.dataUrl || '',
      url: raw.url || '',
      videoId: raw.videoId || '',
      source: raw.source || ''
    };
  };

  const loadPlaylist = () => {
    const tryKeys = [STORAGE_KEY, ...LEGACY_KEYS];
    for (const key of tryKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) continue;
        const normalized = parsed.map((item, i) => normalizeTrack(item, i)).filter(Boolean);
        if (normalized.length) {
          state.playlist = normalized;
          savePlaylist();
          return;
        }
      } catch (_) {
      }
    }
  };

  const savePlaylist = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.playlist));
  };

  const extractNameFromUrl = (urlText) => {
    if (!urlText || typeof urlText !== 'string') return '';
    try {
      const u = new URL(urlText);
      const file = decodeURIComponent((u.pathname.split('/').pop() || '').trim());
      return file || '';
    } catch (_) {
      return '';
    }
  };

  const parseYouTubeId = (input) => {
    try {
      const url = new URL(String(input || '').trim());
      const host = url.hostname.replace('www.', '');

      if (host === 'youtu.be') return url.pathname.slice(1) || '';
      if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
        if (url.pathname === '/watch') return url.searchParams.get('v') || '';
        if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || '';
        if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2] || '';
      }
      return '';
    } catch (_) {
      return '';
    }
  };

  const trackLabel = (track) => {
    if (track.type === 'youtube') return 'YOUTUBE';
    if (track.source === 'jukehost') return 'JUKEHOST';
    if (track.type === 'audio_url') return 'ONLINE';
    return 'MP3';
  };

  const getCurrentTrack = () => state.playlist[state.currentIndex] || null;

  const ensureYtApi = () => {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (state.ytReadyPromise) return state.ytReadyPromise;

    state.ytReadyPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        resolve();
      };

      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => reject(new Error('YouTube API yuklenemedi'));
      document.head.appendChild(s);
    });

    return state.ytReadyPromise;
  };

  const stopYouTube = () => {
    if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
      state.ytPlayer.pauseVideo();
    }
  };

  const stopAudio = () => {
    const audio = byId('audioPlayer');
    if (!audio) return;
    audio.pause();
  };

  const resolvePromptName = (nameGuess, fallbackQuestion) => {
    const cleaned = (nameGuess || '').trim();
    if (cleaned && !/^track-\d+\.mp3$/i.test(cleaned)) return cleaned;

    const answer = window.prompt(fallbackQuestion, cleaned || '');
    const finalName = (answer || '').trim();
    return finalName || cleaned || `Parca ${Math.floor(Math.random() * 1000)}`;
  };

  const safeParseResponse = (text) => {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  };

  const addTrack = (track) => {
    const normalized = normalizeTrack(track, state.playlist.length);
    if (!normalized) return false;
    state.playlist.push(normalized);
    savePlaylist();
    return true;
  };

  const removeTrack = (index) => {
    if (!state.playlist[index]) return;
    const wasCurrent = index === state.currentIndex;
    state.playlist.splice(index, 1);

    if (!state.playlist.length) {
      state.currentIndex = -1;
      stopAudio();
      stopYouTube();
    } else if (wasCurrent) {
      state.currentIndex = Math.min(index, state.playlist.length - 1);
    } else if (index < state.currentIndex) {
      state.currentIndex -= 1;
    }

    savePlaylist();
  };

  const clearAll = () => {
    state.playlist = [];
    state.currentIndex = -1;
    savePlaylist();
    stopAudio();
    stopYouTube();
  };

  const renderPlaylist = (listEl, options = {}) => {
    if (!listEl) return;
    listEl.innerHTML = '';

    state.playlist.forEach((track, index) => {
      const li = document.createElement('li');
      if (index === state.currentIndex) li.classList.add('active');

      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = trackLabel(track);

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = track.name || `Parca ${index + 1}`;
      name.title = name.textContent;

      li.appendChild(tag);
      li.appendChild(name);

      if (options.showDelete) {
        const del = document.createElement('button');
        del.className = 'danger';
        del.type = 'button';
        del.textContent = 'Sil';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          removeTrack(index);
          renderPlaylist(listEl, options);
          if (typeof options.onAfterChange === 'function') options.onAfterChange();
        });
        li.appendChild(del);
      }

      if (typeof options.onClickTrack === 'function') {
        li.addEventListener('click', () => options.onClickTrack(index));
      }

      listEl.appendChild(li);
    });
  };

  const initPlayerPage = () => {
    const listEl = byId('playlistList');
    const audio = byId('audioPlayer');
    const now = byId('nowPlaying');
    const seek = byId('seekBar');
    const currentTime = byId('currentTime');
    const totalTime = byId('totalTime');
    const playPause = byId('playPauseBtn');

    const updateNow = () => {
      const t = getCurrentTrack();
      now.textContent = t ? `Caliniyor: ${t.name}` : 'Playlist bos.';
    };

    const resetTime = () => {
      seek.value = 0;
      currentTime.textContent = '00:00';
      totalTime.textContent = '00:00';
    };

    const ensureYtPlayer = async (videoId, autoPlay) => {
      await ensureYtApi();
      const container = byId('youtubePlayer');

      if (!state.ytPlayer) {
        state.ytPlayer = new window.YT.Player(container, {
          width: '1',
          height: '1',
          videoId,
          playerVars: { autoplay: autoPlay ? 1 : 0, playsinline: 1 },
          events: {
            onStateChange: (e) => {
              if (!window.YT) return;
              if (e.data === window.YT.PlayerState.PLAYING) playPause.textContent = 'Duraklat';
              if (e.data === window.YT.PlayerState.PAUSED) playPause.textContent = 'Cal';
              if (e.data === window.YT.PlayerState.ENDED) next();
            }
          }
        });
      } else if (autoPlay) {
        state.ytPlayer.loadVideoById(videoId);
      } else {
        state.ytPlayer.cueVideoById(videoId);
      }
    };

    const loadTrack = async (index, autoPlay = false) => {
      const t = state.playlist[index];
      if (!t) return;

      state.currentIndex = index;
      renderPlaylist(listEl, { onClickTrack: (i) => loadTrack(i, true) });
      updateNow();
      resetTime();

      if (t.type === 'youtube') {
        stopAudio();
        audio.removeAttribute('src');
        audio.load();
        try {
          await ensureYtPlayer(t.videoId, autoPlay);
          playPause.textContent = autoPlay ? 'Duraklat' : 'Cal';
        } catch (_) {
          alert('YouTube oynatici yuklenemedi.');
        }
        return;
      }

      stopYouTube();
      audio.src = t.type === 'audio_local' ? t.dataUrl : t.url;
      if (autoPlay) audio.play().catch(() => {});
    };

    const next = () => {
      if (!state.playlist.length) return;
      const ni = (state.currentIndex + 1) % state.playlist.length;
      loadTrack(ni, true);
    };

    const prev = () => {
      if (!state.playlist.length) return;
      const pi = (state.currentIndex - 1 + state.playlist.length) % state.playlist.length;
      loadTrack(pi, true);
    };

    byId('nextBtn').addEventListener('click', next);
    byId('prevBtn').addEventListener('click', prev);

    playPause.addEventListener('click', () => {
      const t = getCurrentTrack();
      if (!t) {
        if (state.playlist.length) loadTrack(0, true);
        return;
      }

      if (t.type === 'youtube') {
        if (!state.ytPlayer || !window.YT) {
          loadTrack(state.currentIndex, true);
          return;
        }
        const s = state.ytPlayer.getPlayerState();
        if (s === window.YT.PlayerState.PLAYING) state.ytPlayer.pauseVideo();
        else state.ytPlayer.playVideo();
        return;
      }

      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });

    byId('removeCurrentBtn').addEventListener('click', () => {
      if (state.currentIndex < 0) return;
      removeTrack(state.currentIndex);
      renderPlaylist(listEl, { onClickTrack: (i) => loadTrack(i, true) });
      updateNow();
      resetTime();
      if (state.playlist.length) loadTrack(Math.max(0, state.currentIndex), false);
    });

    byId('clearBtn').addEventListener('click', () => {
      clearAll();
      renderPlaylist(listEl, { onClickTrack: (i) => loadTrack(i, true) });
      updateNow();
      resetTime();
      playPause.textContent = 'Cal';
    });

    audio.addEventListener('play', () => { playPause.textContent = 'Duraklat'; });
    audio.addEventListener('pause', () => { if (getCurrentTrack()?.type !== 'youtube') playPause.textContent = 'Cal'; });
    audio.addEventListener('ended', () => { if (getCurrentTrack()?.type !== 'youtube') next(); });

    audio.addEventListener('loadedmetadata', () => {
      totalTime.textContent = formatTime(audio.duration);
    });

    audio.addEventListener('timeupdate', () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      seek.value = (audio.currentTime / audio.duration) * 100;
      currentTime.textContent = formatTime(audio.currentTime);
      totalTime.textContent = formatTime(audio.duration);
    });

    seek.addEventListener('input', () => {
      const t = getCurrentTrack();
      if (!t) return;

      if (t.type === 'youtube') {
        if (!state.ytPlayer || typeof state.ytPlayer.getDuration !== 'function') return;
        const d = state.ytPlayer.getDuration();
        if (!Number.isFinite(d) || d <= 0) return;
        state.ytPlayer.seekTo((seek.value / 100) * d, true);
        return;
      }

      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      audio.currentTime = (seek.value / 100) * audio.duration;
    });

    state.ytTick = setInterval(() => {
      const t = getCurrentTrack();
      if (!t || t.type !== 'youtube') return;
      if (!state.ytPlayer || typeof state.ytPlayer.getCurrentTime !== 'function') return;
      const d = state.ytPlayer.getDuration();
      const c = state.ytPlayer.getCurrentTime();
      if (!Number.isFinite(d) || d <= 0) return;
      seek.value = (c / d) * 100;
      currentTime.textContent = formatTime(c);
      totalTime.textContent = formatTime(d);
    }, 500);

    renderPlaylist(listEl, { onClickTrack: (i) => loadTrack(i, true) });
    updateNow();

    if (state.playlist.length) {
      loadTrack(0, false);
    }
  };

  const initAddPage = () => {
    const listEl = byId('playlistList');
    const manualStatus = byId('manualStatus');

    const refreshList = () => {
      renderPlaylist(listEl, {
        showDelete: true,
        onAfterChange: refreshList
      });
      byId('totalCount').textContent = String(state.playlist.length);
    };

    const readFile = (file) => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

    byId('fileInput').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('audio/'));
      for (const f of files) {
        const dataUrl = await readFile(f);
        const name = resolvePromptName(f.name, 'Bu muzik icin ad gir:');
        addTrack({ type: 'audio_local', name, dataUrl });
      }
      e.target.value = '';
      refreshList();
    });

    byId('addYoutubeBtn').addEventListener('click', () => {
      const link = byId('youtubeInput').value.trim();
      if (!link) return;

      const videoId = parseYouTubeId(link);
      if (!videoId) {
        alert('Gecerli bir YouTube linki gir.');
        return;
      }

      const defaultName = `YouTube - ${videoId}`;
      const manualName = byId('youtubeName').value.trim();
      const name = resolvePromptName(manualName || defaultName, 'YouTube parca adi gir:');

      addTrack({ type: 'youtube', name, videoId, url: link });
      byId('youtubeInput').value = '';
      byId('youtubeName').value = '';
      refreshList();
    });

    byId('youtubeInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') byId('addYoutubeBtn').click();
    });

    byId('addUrlBtn').addEventListener('click', () => {
      const url = byId('manualUrlInput').value.trim();
      const guessName = byId('manualUrlName').value.trim() || extractNameFromUrl(url);

      if (!url) {
        manualStatus.textContent = 'MP3 linki girmen gerekiyor.';
        return;
      }

      if (!/^https?:\/\/.+\.mp3(\?.*)?$/i.test(url)) {
        manualStatus.textContent = 'Link .mp3 ile bitmeli (http/https).';
        return;
      }

      const name = resolvePromptName(guessName, 'Bu linkteki muzik icin ad gir:');
      addTrack({ type: 'audio_url', name, url, source: 'manual' });

      byId('manualUrlInput').value = '';
      byId('manualUrlName').value = '';
      manualStatus.textContent = 'MP3 linki playlist\'e eklendi.';
      refreshList();
    });

    byId('clearBtn').addEventListener('click', () => {
      clearAll();
      refreshList();
    });

    refreshList();
  };

  const init = () => {
    loadPlaylist();
    const page = document.body.dataset.page;
    if (page === 'player') initPlayerPage();
    if (page === 'add') initAddPage();
  };

  init();
})();
