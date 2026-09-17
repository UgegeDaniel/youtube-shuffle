let accessToken=null,playlists=[],subscriptions=[],currentSource=null,currentVideos=[],player=null,history=[];

document.addEventListener("DOMContentLoaded",()=>{
  loadHistory();
  setupEvents();
  const stored=localStorage.getItem("youtube_shuffle_access_token");
  if(stored){accessToken=stored;showApp();loadUserData();}
});

function setupEvents(){
  document.getElementById("loginBtn").addEventListener("click",login);
  document.getElementById("logoutBtn").addEventListener("click",logout);
  document.getElementById("playlistBtn").addEventListener("click",showPlaylists);
  document.getElementById("subscriptionsBtn").addEventListener("click",showSubscriptions);
  document.getElementById("surpriseBtn").addEventListener("click",surpriseMe);
  document.getElementById("randomSubscriptionBtn").addEventListener("click",randomSubscription);
  document.getElementById("shuffleAgainBtn").addEventListener("click",shuffleAgain);
  document.getElementById("homeBtn").addEventListener("click",showHome);
  document.getElementById("clearHistoryBtn").addEventListener("click",clearHistory);
  document.querySelectorAll("[data-home]").forEach(b=>b.addEventListener("click",showHome));
}

function setStatus(message){document.getElementById("loginStatus").textContent=message||"";}

function login(){
  if(!window.google?.accounts?.oauth2){
    setStatus("Google Identity Services did not load. Check your internet connection.");
    return;
  }
  if(!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.startsWith("YOUR_")){
    setStatus("Add your Google OAuth Client ID in config.js first.");
    return;
  }

  const client=google.accounts.oauth2.initTokenClient({
    client_id:CONFIG.GOOGLE_CLIENT_ID,
    scope:"openid profile email https://www.googleapis.com/auth/youtube.readonly",
    callback:async response=>{
      if(response?.access_token){
        accessToken=response.access_token;
        localStorage.setItem("youtube_shuffle_access_token",accessToken);
        showApp();
        try{await loadUserData();}catch(e){console.error(e);}
      }else setStatus("Google did not return an access token.");
    },
    error_callback:error=>{
      console.error(error);
      setStatus("Google sign-in failed. Check your OAuth origin and client configuration.");
    }
  });
  client.requestAccessToken({prompt:"consent"});
}

function logout(){
  if(accessToken && window.google?.accounts?.oauth2){
    try{google.accounts.oauth2.revoke(accessToken,()=>{});}catch(e){}
  }
  accessToken=null;
  localStorage.removeItem("youtube_shuffle_access_token");
  showLogin();
}

function showApp(){
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  setStatus("");
}
function showLogin(){
  document.getElementById("appScreen").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}
function hideViews(){document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"))}
function showHome(){hideViews();document.getElementById("homeView").classList.remove("hidden")}

async function loadUserData(){
  if(!accessToken)return;
  playlists=await getPlaylists();
  subscriptions=await getSubscriptions();
  renderPlaylists();
  renderSubscriptions();
}

async function youtubeRequest(endpoint,params={}){
  const url=new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries({...params,key:CONFIG.YOUTUBE_API_KEY}).forEach(([k,v])=>{
    if(v!==undefined&&v!==null&&v!=="")url.searchParams.set(k,v);
  });
  const response=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
  if(!response.ok){
    if(response.status===401){logout();}
    const text=await response.text();
    throw new Error(text||`YouTube API error ${response.status}`);
  }
  return response.json();
}

async function getPlaylists(){
  if(!CONFIG.YOUTUBE_API_KEY||CONFIG.YOUTUBE_API_KEY.startsWith("YOUR_"))throw new Error("Add your YouTube API key in config.js.");
  const out=[];let pageToken="";
  do{
    const data=await youtubeRequest("playlists",{part:"snippet,contentDetails",mine:true,maxResults:50,pageToken});
    (data.items||[]).forEach(item=>out.push({
      id:item.id,title:item.snippet?.title||"Untitled",description:item.snippet?.description||"",
      thumbnail:item.snippet?.thumbnails?.medium?.url||item.snippet?.thumbnails?.default?.url||"",
      count:item.contentDetails?.itemCount||0
    }));
    pageToken=data.nextPageToken||"";
  }while(pageToken);
  return out;
}

async function getSubscriptions(){
  const out=[];let pageToken="";
  do{
    const data=await youtubeRequest("subscriptions",{part:"snippet",mine:true,maxResults:50,pageToken});
    (data.items||[]).forEach(item=>out.push({
      id:item.snippet?.resourceId?.channelId,title:item.snippet?.title||"Untitled",
      description:item.snippet?.description||"",
      thumbnail:item.snippet?.thumbnails?.medium?.url||item.snippet?.thumbnails?.default?.url||""
    }));
    pageToken=data.nextPageToken||"";
  }while(pageToken);
  return out;
}

async function getPlaylistVideos(playlistId){
  const out=[];let pageToken="";
  do{
    const data=await youtubeRequest("playlistItems",{part:"snippet,contentDetails",playlistId,maxResults:50,pageToken});
    (data.items||[]).forEach(item=>{
      const id=item.snippet?.resourceId?.videoId;if(!id)return;
      out.push({id,title:item.snippet?.title||"Untitled",
        thumbnail:item.snippet?.thumbnails?.high?.url||item.snippet?.thumbnails?.medium?.url||"",
        channel:item.snippet?.videoOwnerChannelTitle||item.snippet?.channelTitle||"",
        source:"playlist",sourceId:playlistId});
    });
    pageToken=data.nextPageToken||"";
  }while(pageToken);
  return out;
}

async function getChannelVideos(channelId){
  const out=[];let pageToken="";
  do{
    const data=await youtubeRequest("search",{part:"snippet",channelId,type:"video",maxResults:50,order:"date",pageToken});
    (data.items||[]).forEach(item=>{
      const id=item.id?.videoId;if(!id)return;
      out.push({id,title:item.snippet?.title||"Untitled",
        thumbnail:item.snippet?.thumbnails?.high?.url||item.snippet?.thumbnails?.medium?.url||"",
        channel:item.snippet?.channelTitle||"",source:"subscription",sourceId:channelId});
    });
    pageToken=data.nextPageToken||"";
  }while(pageToken);
  return out;
}

function renderPlaylists(){
  const c=document.getElementById("playlistsContainer");c.innerHTML="";
  if(!playlists.length){c.innerHTML="<p>No playlists found.</p>";return;}
  playlists.forEach(p=>{
    const card=document.createElement("button");card.className="item-card";
    card.innerHTML=`<img class="thumbnail" src="${escapeHTML(p.thumbnail)}" alt=""><div class="item-info"><h3>${escapeHTML(p.title)}</h3><p>${p.count} videos</p></div>`;
    card.addEventListener("click",()=>playRandomPlaylistVideo(p));c.appendChild(card);
  });
}
function renderSubscriptions(){
  const c=document.getElementById("subscriptionsContainer");c.innerHTML="";
  if(!subscriptions.length){c.innerHTML="<p>No subscriptions found.</p>";return;}
  subscriptions.forEach(ch=>{
    const card=document.createElement("button");card.className="item-card";
    card.innerHTML=`<img class="thumbnail" src="${escapeHTML(ch.thumbnail)}" alt=""><div class="item-info"><h3>${escapeHTML(ch.title)}</h3><p>Random video</p></div>`;
    card.addEventListener("click",()=>playRandomChannelVideo(ch));c.appendChild(card);
  });
}
function showPlaylists(){hideViews();document.getElementById("playlistsView").classList.remove("hidden");renderPlaylists()}
function showSubscriptions(){hideViews();document.getElementById("subscriptionsView").classList.remove("hidden");renderSubscriptions()}

async function playRandomPlaylistVideo(p){
  try{
    currentSource={type:"playlist",id:p.id};
    const videos=await getPlaylistVideos(p.id);
    if(!videos.length){alert("No playable videos found in this playlist.");return;}
    currentVideos=videos;playVideo(chooseRandomVideo(videos));
  }catch(e){console.error(e);alert(apiMessage(e))}
}
async function playRandomChannelVideo(ch){
  try{
    currentSource={type:"subscription",id:ch.id};
    const videos=await getChannelVideos(ch.id);
    if(!videos.length){alert("No videos found for this channel.");return;}
    currentVideos=videos;playVideo(chooseRandomVideo(videos));
  }catch(e){console.error(e);alert(apiMessage(e))}
}
async function surpriseMe(){
  if(!playlists.length&&!subscriptions.length){alert("Your YouTube data has not loaded yet.");return;}
  if(Math.random()<.5&&playlists.length)return playRandomPlaylistVideo(randomItem(playlists));
  if(subscriptions.length)return playRandomChannelVideo(randomItem(subscriptions));
  return playRandomPlaylistVideo(randomItem(playlists));
}
function randomSubscription(){
  if(!subscriptions.length){alert("No subscriptions found.");return}
  return playRandomChannelVideo(randomItem(subscriptions));
}
function chooseRandomVideo(videos){
  const recent=new Set(history.map(v=>v.id));
  const available=videos.filter(v=>!recent.has(v.id));
  return randomItem(available.length?available:videos);
}
function randomItem(a){return a[Math.floor(Math.random()*a.length)]}

function playVideo(video){
  hideViews();document.getElementById("playerView").classList.remove("hidden");
  document.getElementById("videoTitle").textContent=video.title;
  document.getElementById("videoChannel").textContent=video.channel||"";
  addHistory(video);
  createPlayer(video.id);
}
function createPlayer(videoId){
  if(player?.destroy)player.destroy();
  if(!window.YT?.Player){
    document.getElementById("youtubePlayer").innerHTML=`<a target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}">Open video on YouTube</a>`;
    return;
  }
  player=new YT.Player("youtubePlayer",{videoId,playerVars:{autoplay:1,playsinline:1,rel:0}});
}
async function shuffleAgain(){
  if(currentSource?.type==="playlist"){
    const p=playlists.find(x=>x.id===currentSource.id);if(p)return playRandomPlaylistVideo(p);
  }
  if(currentSource?.type==="subscription"){
    const c=subscriptions.find(x=>x.id===currentSource.id);if(c)return playRandomChannelVideo(c);
  }
}

function addHistory(video){
  history=history.filter(v=>v.id!==video.id);history.unshift(video);history=history.slice(0,20);
  localStorage.setItem("youtube_shuffle_history",JSON.stringify(history));renderHistory();
}
function loadHistory(){
  try{history=JSON.parse(localStorage.getItem("youtube_shuffle_history")||"[]")||[]}catch{history=[]}
  renderHistory();
}
function renderHistory(){
  const c=document.getElementById("historyContainer");if(!c)return;c.innerHTML="";
  history.forEach(video=>{
    const item=document.createElement("div");item.className="history-item";
    item.innerHTML=`<img src="${escapeHTML(video.thumbnail)}" alt=""><span>${escapeHTML(video.title)}</span>`;
    item.addEventListener("click",()=>{currentSource=null;playVideo(video)});c.appendChild(item);
  });
}
function clearHistory(){history=[];localStorage.removeItem("youtube_shuffle_history");renderHistory()}
function escapeHTML(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}
function apiMessage(e){
  const msg=String(e?.message||e||"");
  if(msg.includes("API key"))return "YouTube API key is missing or invalid.";
  if(msg.includes("403"))return "YouTube rejected the request. Check API enablement, OAuth scope, quota, or permissions.";
  if(msg.includes("401"))return "Your Google authorization expired. Please sign in again.";
  return "Something went wrong while loading YouTube data.";
}
