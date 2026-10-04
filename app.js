let accessToken = null;
let playlists = [];
let subscriptions = [];
let currentSource = null;
let currentVideos = [];
let player = null;
let history = [];
let currentVideo = null;

/* =========================
   INITIALIZATION
========================= */

document.addEventListener("DOMContentLoaded", () => {
  loadHistory();
  setupEvents();

  const stored = localStorage.getItem("youtube_shuffle_access_token");

  if (stored) {
    accessToken = stored;
    showApp();
    loadUserData();
  }
});

/* =========================
   EVENTS
========================= */

function setupEvents() {
  document.getElementById("loginBtn")?.addEventListener("click", login);

  document.getElementById("logoutBtn")?.addEventListener("click", logout);

  document
    .getElementById("playlistBtn")
    ?.addEventListener("click", showPlaylists);

  document
    .getElementById("subscriptionsBtn")
    ?.addEventListener("click", showSubscriptions);

  document.getElementById("surpriseBtn")?.addEventListener("click", surpriseMe);

  document
    .getElementById("randomSubscriptionBtn")
    ?.addEventListener("click", randomSubscription);

  document
    .getElementById("shuffleAgainBtn")
    ?.addEventListener("click", shuffleAgain);

  document.getElementById("homeBtn")?.addEventListener("click", showHome);
  document
    .getElementById("removeFromPlaylistBtn")
    ?.addEventListener("click", removeCurrentVideoFromPlaylist);
  document
    .getElementById("clearHistoryBtn")
    ?.addEventListener("click", clearHistory);

  document.querySelectorAll("[data-home]").forEach((button) => {
    button.addEventListener("click", showHome);
  });
}

/* =========================
   STATUS
========================= */

function setStatus(message) {
  const status = document.getElementById("loginStatus");

  if (status) {
    status.textContent = message || "";
  }
}

/* =========================
   LOGIN
========================= */

function login() {
  if (!window.google?.accounts?.oauth2) {
    setStatus(
      "Google Identity Services did not load. Check your internet connection."
    );
    return;
  }

  if (!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.startsWith("YOUR_")) {
    setStatus("Add your Google OAuth Client ID in config.js first.");
    return;
  }

  const client = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,

    scope: "openid profile email https://www.googleapis.com/auth/youtube",

    callback: async (response) => {
      if (response?.access_token) {
        accessToken = response.access_token;

        localStorage.setItem("youtube_shuffle_access_token", accessToken);

        showApp();

        try {
          await loadUserData();
        } catch (error) {
          console.error("loadUserData error:", error);

          setStatus(
            "YouTube data could not be loaded. Check the browser console."
          );
        }
      } else {
        setStatus("Google did not return an access token.");
      }
    },

    error_callback: (error) => {
      console.error("Google OAuth error:", error);

      setStatus(
        "Google sign-in failed. Check your OAuth origin and client configuration."
      );
    },
  });

  client.requestAccessToken({
    prompt: "consent",
  });
}

/* =========================
   LOGOUT
========================= */

function logout() {
  if (accessToken && window.google?.accounts?.oauth2) {
    try {
      google.accounts.oauth2.revoke(accessToken, () => {});
    } catch (error) {
      console.error("Token revoke error:", error);
    }
  }

  accessToken = null;

  localStorage.removeItem("youtube_shuffle_access_token");

  playlists = [];
  subscriptions = [];
  currentSource = null;
  currentVideos = [];

  showLogin();
}

/* =========================
   SCREEN MANAGEMENT
========================= */

function showApp() {
  document.getElementById("loginScreen")?.classList.add("hidden");

  document.getElementById("appScreen")?.classList.remove("hidden");

  setStatus("");
}

function showLogin() {
  document.getElementById("appScreen")?.classList.add("hidden");

  document.getElementById("loginScreen")?.classList.remove("hidden");
}

function hideViews() {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.add("hidden");
  });
}

function showHome() {
  hideViews();

  document.getElementById("homeView")?.classList.remove("hidden");
}

/* =========================
   LOAD YOUTUBE DATA
========================= */

/*
  IMPORTANT FIX:

  Playlists and subscriptions are loaded separately.

  Previously, if getPlaylists() failed,
  getSubscriptions() never ran.
*/

async function loadUserData() {
  if (!accessToken) {
    console.warn("No access token available.");
    return;
  }

  let playlistsLoaded = false;
  let subscriptionsLoaded = false;

  /* -------------------------
     LOAD PLAYLISTS
  ------------------------- */

  try {
    playlists = await getPlaylists();
    playlistsLoaded = true;

    console.log(`Loaded ${playlists.length} playlists.`);
  } catch (error) {
    playlists = [];

    console.error("Failed to load playlists:", error);
  }

  /* -------------------------
     LOAD SUBSCRIPTIONS
  ------------------------- */

  try {
    subscriptions = await getSubscriptions();
    subscriptionsLoaded = true;

    console.log(`Loaded ${subscriptions.length} subscriptions.`);
  } catch (error) {
    subscriptions = [];

    console.error("Failed to load subscriptions:", error);
  }

  /* -------------------------
     RENDER
  ------------------------- */

  renderPlaylists();
  renderSubscriptions();

  /* -------------------------
     STATUS
  ------------------------- */

  if (!playlistsLoaded && !subscriptionsLoaded) {
    setStatus(
      "Could not load your YouTube data. Check the browser console for details."
    );

    return;
  }

  if (playlistsLoaded || subscriptionsLoaded) {
    setStatus("");
  }
}

/* =========================
   YOUTUBE API REQUEST
========================= */

async function youtubeRequest(endpoint, params = {}) {
  if (!accessToken) {
    throw new Error("You are not authenticated with YouTube.");
  }

  if (!CONFIG.YOUTUBE_API_KEY || CONFIG.YOUTUBE_API_KEY.startsWith("YOUR_")) {
    throw new Error("Add your YouTube API key in config.js.");
  }

  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);

  const requestParams = {
    ...params,
    key: CONFIG.YOUTUBE_API_KEY,
  };

  Object.entries(requestParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  console.log(`YouTube API request: ${endpoint}`, params);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();

    console.error(`YouTube API ${response.status}:`, text);

    /*
      Don't automatically logout on every 401 while debugging.
      A 401 can indicate an expired/invalid token.
    */

    if (response.status === 401) {
      accessToken = null;

      localStorage.removeItem("youtube_shuffle_access_token");
    }

    throw new Error(text || `YouTube API error ${response.status}`);
  }

  return response.json();
}

/* =========================
   GET PLAYLISTS
========================= */

async function getPlaylists() {
  if (!CONFIG.YOUTUBE_API_KEY || CONFIG.YOUTUBE_API_KEY.startsWith("YOUR_")) {
    throw new Error("Add your YouTube API key in config.js.");
  }

  const out = [];

  let pageToken = "";

  do {
    const data = await youtubeRequest("playlists", {
      part: "snippet,contentDetails",
      mine: true,
      maxResults: 50,
      pageToken,
    });

    (data.items || []).forEach((item) => {
      out.push({
        id: item.id,

        title: item.snippet?.title || "Untitled",

        description: item.snippet?.description || "",

        thumbnail:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          "",

        count: item.contentDetails?.itemCount || 0,
      });
    });

    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return out;
}

async function removeCurrentVideoFromPlaylist() {
  if (!currentVideo?.playlistItemId) {
    alert("This video cannot be removed from a playlist.");
    return;
  }

  if (!currentSource || currentSource.type !== "playlist") {
    alert("This video was not played from a playlist.");
    return;
  }

  const title = currentVideo.title || "this video";

  // const confirmed = confirm(
  //   `Remove "${title}" from this playlist?`
  // );

  // if (!confirmed) {
  //   return;
  // }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");

    url.searchParams.set("id", currentVideo.playlistItemId);

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();

      console.error("Remove from playlist failed:", response.status, text);

      throw new Error(text || `YouTube API error ${response.status}`);
    }

    // Remove it from the current local video list
    currentVideos = currentVideos.filter(
      (video) => video.id !== currentVideo.id
    );

    // Remove it from the local playlist count
    const playlist = playlists.find((item) => item.id === currentSource.id);

    if (playlist && playlist.count > 0) {
      playlist.count--;
    }

    // alert("Video removed from the playlist.");
    const titleElement = document.getElementById("videoTitle");
    if (titleElement) {
      titleElement.textContent = "✅ Video removed from playlist";
    }

    const channelElement = document.getElementById("videoChannel");
    if (channelElement) {
      channelElement.textContent = title;
    }

    currentVideo = null;
    // showHome();

    const removeButton = document.getElementById("removeFromPlaylistBtn");

    if (removeButton) {
      removeButton.disabled = true;
      removeButton.textContent = "✅ Removed";
    }
    setTimeout(() => {
      if (currentVideos.length) {
        const nextVideo = chooseRandomVideo(currentVideos);

        if (nextVideo) {
          playVideo(nextVideo);
        }
      } else {
        if (titleElement) {
          titleElement.textContent = "Playlist is empty";
        }

        if (channelElement) {
          channelElement.textContent = "No more videos available.";
        }

        const playerElement = document.getElementById("youtubePlayer");

        if (playerElement) {
          playerElement.innerHTML = "";
        }
      }
    }, 1200);
  } catch (error) {
    console.error("Remove from playlist error:", error);

    alert(apiMessage(error));
  }
}

function updateRemoveButton() {
  const button = document.getElementById("removeFromPlaylistBtn");

  if (!button) return;

  button.style.display =
    currentSource?.type === "playlist" && currentVideo?.playlistItemId
      ? "inline-block"
      : "none";
}

/* =========================
   GET SUBSCRIPTIONS
========================= */

async function getSubscriptions() {
  const out = [];

  let pageToken = "";

  do {
    const data = await youtubeRequest("subscriptions", {
      part: "snippet",
      mine: true,
      maxResults: 50,
      pageToken,
    });

    (data.items || []).forEach((item) => {
      out.push({
        id: item.snippet?.resourceId?.channelId,

        title: item.snippet?.title || "Untitled",

        description: item.snippet?.description || "",

        thumbnail:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          "",
      });
    });

    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return out;
}

/* =========================
   GET PLAYLIST VIDEOS
========================= */

async function getPlaylistVideos(playlistId) {
  const out = [];

  let pageToken = "";

  do {
    const data = await youtubeRequest("playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: 50,
      pageToken,
    });

    (data.items || []).forEach((item) => {
      const id = item.snippet?.resourceId?.videoId;

      if (!id) return;

      out.push({
        id,
        playlistItemId: item.id,

        title: item.snippet?.title || "Untitled",

        thumbnail:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          "",

        channel:
          item.snippet?.videoOwnerChannelTitle ||
          item.snippet?.channelTitle ||
          "",

        source: "playlist",

        sourceId: playlistId,
      });
    });

    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return out;
}

/* =========================
   GET CHANNEL VIDEOS
========================= */

async function getChannelVideos(channelId) {
  const out = [];

  let pageToken = "";

  do {
    const data = await youtubeRequest("search", {
      part: "snippet",
      channelId,
      type: "video",
      maxResults: 50,
      order: "date",
      pageToken,
    });

    (data.items || []).forEach((item) => {
      const id = item.id?.videoId;

      if (!id) return;

      out.push({
        id,

        title: item.snippet?.title || "Untitled",

        thumbnail:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          "",

        channel: item.snippet?.channelTitle || "",

        source: "subscription",

        sourceId: channelId,
      });
    });

    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return out;
}

/* =========================
   RENDER PLAYLISTS
========================= */

function renderPlaylists() {
  const container = document.getElementById("playlistsContainer");

  if (!container) return;

  container.innerHTML = "";

  if (!playlists.length) {
    container.innerHTML = "<p>No playlists found.</p>";

    return;
  }

  playlists.forEach((playlist) => {
    const card = document.createElement("button");

    card.className = "item-card";

    card.innerHTML = `
      <img
        class="thumbnail"
        src="${escapeHTML(playlist.thumbnail)}"
        alt=""
      >

      <div class="item-info">
        <h3>
          ${escapeHTML(playlist.title)}
        </h3>

        <p>
          ${playlist.count} videos
        </p>
      </div>
    `;

    card.addEventListener("click", () => playRandomPlaylistVideo(playlist));

    container.appendChild(card);
  });
}

/* =========================
   RENDER SUBSCRIPTIONS
========================= */

function renderSubscriptions() {
  const container = document.getElementById("subscriptionsContainer");

  if (!container) return;

  container.innerHTML = "";

  if (!subscriptions.length) {
    container.innerHTML = "<p>No subscriptions found.</p>";

    return;
  }

  subscriptions.forEach((channel) => {
    const card = document.createElement("button");

    card.className = "item-card";

    card.innerHTML = `
      <img
        class="thumbnail"
        src="${escapeHTML(channel.thumbnail)}"
        alt=""
      >

      <div class="item-info">
        <h3>
          ${escapeHTML(channel.title)}
        </h3>

        <p>Random video</p>
      </div>
    `;

    card.addEventListener("click", () => playRandomChannelVideo(channel));

    container.appendChild(card);
  });
}

/* =========================
   SHOW PLAYLISTS
========================= */

function showPlaylists() {
  hideViews();

  document.getElementById("playlistsView")?.classList.remove("hidden");

  renderPlaylists();
}

/* =========================
   SHOW SUBSCRIPTIONS
========================= */

function showSubscriptions() {
  hideViews();

  document.getElementById("subscriptionsView")?.classList.remove("hidden");

  renderSubscriptions();
}

/* =========================
   RANDOM PLAYLIST VIDEO
========================= */

async function playRandomPlaylistVideo(playlist) {
  try {
    currentSource = {
      type: "playlist",
      id: playlist.id,
    };

    const videos = await getPlaylistVideos(playlist.id);

    if (!videos.length) {
      alert("No playable videos found in this playlist.");

      return;
    }

    currentVideos = videos;

    playVideo(chooseRandomVideo(videos));
  } catch (error) {
    console.error("Playlist video error:", error);

    alert(apiMessage(error));
  }
}

/* =========================
   RANDOM CHANNEL VIDEO
========================= */

async function playRandomChannelVideo(channel) {
  try {
    currentSource = {
      type: "subscription",
      id: channel.id,
    };

    const videos = await getChannelVideos(channel.id);

    if (!videos.length) {
      alert("No videos found for this channel.");

      return;
    }

    currentVideos = videos;

    playVideo(chooseRandomVideo(videos));
  } catch (error) {
    console.error("Channel video error:", error);

    alert(apiMessage(error));
  }
}

/* =========================
   SURPRISE ME
========================= */

async function surpriseMe() {
  if (!accessToken) {
    alert("Please sign in with Google first.");

    return;
  }

  if (!playlists.length && !subscriptions.length) {
    alert(
      "No YouTube playlists or subscriptions were loaded. Check the browser console for the API error."
    );

    return;
  }

  if (Math.random() < 0.5 && playlists.length) {
    return playRandomPlaylistVideo(randomItem(playlists));
  }

  if (subscriptions.length) {
    return playRandomChannelVideo(randomItem(subscriptions));
  }

  if (playlists.length) {
    return playRandomPlaylistVideo(randomItem(playlists));
  }
}

/* =========================
   RANDOM SUBSCRIPTION
========================= */

function randomSubscription() {
  if (!accessToken) {
    alert("Please sign in with Google first.");

    return;
  }

  if (!subscriptions.length) {
    alert("No subscriptions found.");

    return;
  }

  return playRandomChannelVideo(randomItem(subscriptions));
}

/* =========================
   RANDOM VIDEO
========================= */

function chooseRandomVideo(videos) {
  if (!videos?.length) {
    return null;
  }

  const recent = new Set(history.map((video) => video.id));

  const available = videos.filter((video) => !recent.has(video.id));

  return randomItem(available.length ? available : videos);
}

function randomItem(array) {
  if (!array?.length) {
    return null;
  }

  return array[Math.floor(Math.random() * array.length)];
}

/* =========================
   PLAY VIDEO
========================= */

function playVideo(video) {
  if (!video?.id) {
    console.error("Invalid video:", video);

    return;
  }
  currentVideo = video;

  hideViews();

  document.getElementById("playerView")?.classList.remove("hidden");

  const title = document.getElementById("videoTitle");

  if (title) {
    title.textContent = video.title || "Untitled";
  }

  const channel = document.getElementById("videoChannel");

  if (channel) {
    channel.textContent = video.channel || "";
  }

  addHistory(video);

  createPlayer(video.id);
}

/* =========================
   YOUTUBE PLAYER
========================= */

function createPlayer(videoId) {
  if (!videoId) {
    return;
  }

  if (player?.destroy) {
    try {
      player.destroy();
    } catch (error) {
      console.error("Player destroy error:", error);
    }

    player = null;
  }

  const playerElement = document.getElementById("youtubePlayer");

  if (!playerElement) {
    console.error("youtubePlayer element not found.");

    return;
  }

  playerElement.innerHTML = "";

  /*
    If the YouTube IFrame API has not loaded,
    provide a direct YouTube link.
  */

  if (!window.YT?.Player) {
    const link = document.createElement("a");

    link.target = "_blank";
    link.rel = "noopener noreferrer";

    link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(
      videoId
    )}`;

    link.textContent = "Open video on YouTube";

    playerElement.appendChild(link);

    return;
  }

  player = new YT.Player("youtubePlayer", {
    videoId,

    playerVars: {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
    },
  });
}

/* =========================
   SHUFFLE AGAIN
========================= */

async function shuffleAgain() {
  if (!currentSource) {
    return surpriseMe();
  }

  if (currentSource.type === "playlist") {
    const playlist = playlists.find((item) => item.id === currentSource.id);

    if (playlist) {
      return playRandomPlaylistVideo(playlist);
    }
  }

  if (currentSource.type === "subscription") {
    const channel = subscriptions.find((item) => item.id === currentSource.id);

    if (channel) {
      return playRandomChannelVideo(channel);
    }
  }

  return surpriseMe();
}

/* =========================
   HISTORY
========================= */

function addHistory(video) {
  if (!video?.id) {
    return;
  }

  history = history.filter((item) => item.id !== video.id);

  history.unshift(video);

  history = history.slice(0, 20);

  localStorage.setItem("youtube_shuffle_history", JSON.stringify(history));

  renderHistory();
}

/* =========================
   LOAD HISTORY
========================= */

function loadHistory() {
  try {
    history =
      JSON.parse(localStorage.getItem("youtube_shuffle_history") || "[]") || [];
  } catch (error) {
    console.error("History load error:", error);

    history = [];
  }

  renderHistory();
}

/* =========================
   RENDER HISTORY
========================= */

function renderHistory() {
  const container = document.getElementById("historyContainer");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  history.forEach((video) => {
    const item = document.createElement("div");

    item.className = "history-item";

    item.innerHTML = `
      <img
        src="${escapeHTML(video.thumbnail)}"
        alt=""
      >

      <span>
        ${escapeHTML(video.title)}
      </span>
    `;

    item.addEventListener("click", () => {
      currentSource = null;
      playVideo(video);
    });

    container.appendChild(item);
  });
}

/* =========================
   CLEAR HISTORY
========================= */

function clearHistory() {
  history = [];

  localStorage.removeItem("youtube_shuffle_history");

  renderHistory();
}

/* =========================
   ESCAPE HTML
========================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================
   API ERROR MESSAGE
========================= */

function apiMessage(error) {
  const message = String(error?.message || error || "");

  console.error("YouTube API error:", message);

  if (message.includes("API key")) {
    return "YouTube API key is missing or invalid. Check config.js.";
  }

  if (message.includes("401")) {
    return "Google authorization expired or is invalid. Please sign in again.";
  }

  if (message.includes("403")) {
    return "YouTube returned 403. Check that YouTube Data API v3 is enabled, your API key restrictions are correct, your OAuth permissions are valid, and your quota is available.";
  }

  if (message.includes("404")) {
    return "YouTube could not find the requested resource.";
  }

  return `Something went wrong while loading YouTube data.\n\n${message}`;
}
