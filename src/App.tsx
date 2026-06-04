import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { usePlayerStore } from "./store/usePlayerStore";
import { getOnboardingStatus } from "./lib/api/recommendation";
import type { VideoSummary } from "./types/video";

import { PageWrapper } from "./components/layout/PageWrapper";

import Home from "./pages/Home";
import Search from "./pages/Search";
import Subscriptions from "./pages/Subscriptions";
import History from "./pages/History";
import Playlists from "./pages/Playlists";
import PlaylistDetailsPage from "./pages/PlaylistDetailsPage";
import Settings from "./pages/Settings";
import ImportData from "./pages/ImportData";
import ExtensionsPage from "./pages/ExtensionsPage";
import Channel from "./pages/Channel";
import { Watch } from "./pages/Watch";
import Onboarding from "./pages/Onboarding";
import FlowNeuroPersona from "./pages/FlowNeuroPersona";
import { ToastHost } from "./components/ui/ToastHost";

import "./App.css";

function App() {
  const { addToQueue, setQueue } = usePlayerStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [loadingOnboarding, setLoadingOnboarding] = useState(true);

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
          <Route path="search" element={
            <Search onPlay={handlePlayVideo} onAddToQueue={handleAddToQueue} />
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
          <Route path="history" element={
            <History onPlay={handlePlayVideo} />
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
      <ToastHost />
    </div>
  );
}

export default App;
