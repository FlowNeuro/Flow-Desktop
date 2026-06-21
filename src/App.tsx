import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { usePlayerStore } from "./store/usePlayerStore";
import { useFeedActionsStore } from "./store/useFeedActionsStore";
import { useAppSettingsStore } from "./store/useAppSettingsStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { useAlbumLibraryStore } from "./store/useAlbumLibraryStore";
import { useLikesStore } from "./store/useLikesStore";
import { getOnboardingStatus } from "./lib/api/recommendation";
import { WATCH_LATER_PLAYLIST_ID } from "./lib/playlistLibrary";
import type { VideoSummary } from "./types/video";

import { PageWrapper } from "./components/layout/PageWrapper";

import Home from "./pages/Home";
import MusicHome from "./pages/music/MusicHome";
import ArtistPage from "./pages/music/ArtistPage";
import ArtistItemsPage from "./pages/music/ArtistItemsPage";
import MusicCollectionPage from "./pages/music/MusicCollectionPage";
import Search from "./pages/Search";
import ExploreCategories from "./pages/ExploreCategories";
import Subscriptions from "./pages/Subscriptions";
import History from "./pages/History";
import Likes from "./pages/Likes";
import LibraryPage from "./pages/LibraryPage";
import AlbumsLibrary from "./pages/AlbumsLibrary";
import Playlists from "./pages/Playlists";
import PlaylistDetailsPage from "./pages/PlaylistDetailsPage";
import Settings from "./pages/Settings";
import ImportData from "./pages/ImportData";
import ExtensionsPage from "./pages/ExtensionsPage";
import Channel from "./pages/Channel";
import { Watch } from "./pages/Watch";
import { ShortsFeed } from "./components/shorts/ShortsFeed";
import Onboarding from "./pages/Onboarding";
import FlowNeuroPersona from "./pages/FlowNeuroPersona";
import { LayoutGroup } from "framer-motion";
import { ToastHost } from "./components/ui/ToastHost";
import { GlobalMusicAudio } from "./components/music/GlobalMusicAudio";
import { GlobalMusicDock } from "./components/music/GlobalMusicDock";
import { MusicOverlay } from "./components/music/MusicOverlay";
import { AddToAlbumModal } from "./components/music/AddToAlbumModal";
import { AddTracksToAlbumModal } from "./components/music/AddTracksToAlbumModal";
import { AddToPlaylistModal } from "./components/playlist/AddToPlaylistModal";
import { DeepFlowController } from "./components/deep-flow/DeepFlowController";

import "./App.css";

function App() {
  const { addToQueue, setQueue } = usePlayerStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [loadingOnboarding, setLoadingOnboarding] = useState(true);

  useEffect(() => {
    void useFeedActionsStore.getState().load();
    void useAppSettingsStore.getState().loadSettings();
    void useSettingsStore.getState().loadSettings();
    void useAlbumLibraryStore.getState().load();
    void useLikesStore.getState().load();
  }, []);

  // Check onboarding state from sqlite db setting
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const completed = await getOnboardingStatus();
        if (!completed && location.pathname !== "/onboarding") {
          navigate("/onboarding");
        }
      } catch (e) {
        console.warn("Failed to read onboarding telemetry status", e);
      } finally {
        setLoadingOnboarding(false);
      }
    };
    checkOnboarding();
  }, [navigate, location.pathname]);

  const handlePlayVideo = (video: VideoSummary) => {
    setQueue([video], 0);
    navigate(`/watch/${video.id}`);
  };

  const handleAddToQueue = (video: VideoSummary) => {
    addToQueue(video);
  };

  if (loadingOnboarding) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-sans">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-background text-zinc-100 font-sans">
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        
        <Route path="/" element={<PageWrapper />}>
          <Route index element={
            <Home onPlay={handlePlayVideo} onAddToQueue={handleAddToQueue} />
          } />
          <Route path="feed" element={
            <FlowNeuroPersona />
          } />
          <Route path="music" element={
            <MusicHome />
          } />
          <Route path="music/artist/:artistId" element={
            <ArtistPage />
          } />
          <Route path="music/artist/:artistId/items" element={
            <ArtistItemsPage />
          } />
          <Route path="music/album/:id" element={
            <MusicCollectionPage kind="album" />
          } />
          <Route path="music/playlist/:id" element={
            <MusicCollectionPage kind="playlist" />
          } />
          <Route path="search" element={
            <Search onPlay={handlePlayVideo} onAddToQueue={handleAddToQueue} />
          } />
          <Route path="explore" element={
            <ExploreCategories onPlay={handlePlayVideo} onAddToQueue={handleAddToQueue} />
          } />
          <Route path="shorts" element={
            <ShortsFeed />
          } />
          <Route path="shorts/:videoId" element={
            <ShortsFeed />
          } />
          <Route path="subscriptions" element={
            <Subscriptions onPlay={handlePlayVideo} onAddToQueue={handleAddToQueue} />
          } />
          <Route path="channel/:channelId" element={
            <Channel onPlay={handlePlayVideo} onAddToQueue={handleAddToQueue} />
          } />
          <Route path="playlists" element={
            <Playlists onPlay={handlePlayVideo} />
          } />
          <Route path="playlist/:playlistId" element={
            <PlaylistDetailsPage
              onPlay={handlePlayVideo}
              onAddToQueue={handleAddToQueue}
            />
          } />
          <Route path="watch-later" element={
            <PlaylistDetailsPage
              playlistIdOverride={WATCH_LATER_PLAYLIST_ID}
              onPlay={handlePlayVideo}
              onAddToQueue={handleAddToQueue}
            />
          } />
          <Route path="library" element={
            <LibraryPage onPlay={handlePlayVideo} onAddToQueue={handleAddToQueue} />
          } />
          <Route path="albums" element={
            <AlbumsLibrary />
          } />
          <Route path="history" element={
            <History onPlay={handlePlayVideo} />
          } />
          <Route path="liked" element={
            <Likes onPlay={handlePlayVideo} />
          } />
          <Route path="settings" element={
            <Settings />
          } />
          <Route path="settings/import" element={
            <ImportData />
          } />
          <Route path="sponsorblock" element={
            <ExtensionsPage />
          } />
          <Route path="watch/:videoId" element={
            <Watch />
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <GlobalMusicAudio />
      <LayoutGroup>
        <GlobalMusicDock />
        <MusicOverlay />
      </LayoutGroup>
      <AddToAlbumModal />
      <AddTracksToAlbumModal />
      <AddToPlaylistModal />
      <DeepFlowController />
      <ToastHost />
    </div>
  );
}

export default App;
