"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Layers, LoaderCircle, Mic2, Play, Radio, RefreshCw, Square, Video } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Destination = { id: string; label: string; provider: string; status: string };
type Scene = { id: string; start: number; end: number; title: string; subtitle: string; position: string };
type ScenePlan = { version: number; layout: string; scenes: Scene[] };
type Props = { user: User | null; script: string; productName: string; hostName: string; layout: string };
const VOICES = ["alloy", "ash", "coral", "echo", "nova", "onyx", "sage", "shimmer"];
const ACTIVE_PRESENTER = new Set(["queued", "generating"]);
const ACTIVE_STREAM = new Set(["ready", "queued", "starting", "live"]);

export function StreamLaunchPanel({ user, script, productName, hostName, layout }: Props) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [audioUrl, setAudioUrl] = useState("");
  const [presenterJobId, setPresenterJobId] = useState("");
  const [presenterMediaUrl, setPresenterMediaUrl] = useState("");
  const [presenterStatus, setPresenterStatus] = useState("not-created");
  const [broadcastJobId, setBroadcastJobId] = useState("");
  const [broadcastStatus, setBroadcastStatus] = useState("not-started");
  const [scenePlan, setScenePlan] = useState<ScenePlan | null>(null);
  const [offerText, setOfferText] = useState("Featured live offer");
  const [cta, setCta] = useState("Tap the product card to shop now");
  const [message, setMessage] = useState("");
  const [loadingDestinations, setLoadingDestinations] = useState(false);
  const [generatingVoice, setGeneratingVoice] = useState(false);
  const [generatingPresenter, setGeneratingPresenter] = useState(false);
  const [generatingScenes, setGeneratingScenes] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [stopping, setStopping] = useState(false);

  const selectedDestination = useMemo(() => destinations.find((item) => item.id === destinationId) || null, [destinations, destinationId]);

  useEffect(() => {
    if (!user) { setDestinations([]); setDestinationId(""); return; }
    void loadDestinations();
  }, [user]);

  useEffect(() => {
    setScenePlan(null);
  }, [productName, layout]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  useEffect(() => {
    if (!presenterJobId || !ACTIVE_PRESENTER.has(presenterStatus)) return;
    const timer = window.setInterval(() => void refreshPresenterStatus(), 4000);
    return () => window.clearInterval(timer);
  }, [presenterJobId, presenterStatus]);

  useEffect(() => {
    if (!broadcastJobId || !ACTIVE_STREAM.has(broadcastStatus)) return;
    const timer = window.setInterval(() => void refreshBroadcastStatus(), 4000);
    return () => window.clearInterval(timer);
  }, [broadcastJobId, broadcastStatus]);

  async function getToken() {
    const supabase = getSupabaseBrowser();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Your session expired. Sign in again.");
    return { supabase, token };
  }

  async function loadDestinations() {
    if (!user) return;
    setLoadingDestinations(true); setMessage("");
    try {
      const { supabase } = await getToken();
      const { data, error } = await supabase.from("broadcast_destinations").select("id,label,provider,status").eq("status", "connected").order("created_at", { ascending: false });
      if (error) throw error;
      const next = (data || []) as Destination[];
      setDestinations(next); setDestinationId((current) => current || next[0]?.id || "");
      setMessage(next.length ? "Broadcast destination ready." : "Save an RTMP destination in the Stream step first.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load destinations."); }
    finally { setLoadingDestinations(false); }
  }

  async function previewVoice() {
    if (!script.trim()) return setMessage("Generate or enter a script before creating a voice preview.");
    setGeneratingVoice(true); setMessage("");
    try {
      const response = await fetch("/api/voice/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: script, voice }) });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || "Unable to generate voice preview."); }
      const blob = await response.blob(); if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob)); setMessage("AI voice preview generated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to generate voice preview."); }
    finally { setGeneratingVoice(false); }
  }

  async function generatePresenter() {
    if (!user) return setMessage("Sign in before generating an AI presenter.");
    if (!script.trim()) return setMessage("Prepare the script before generating the presenter.");
    setGeneratingPresenter(true); setMessage("");
    try {
      const { token } = await getToken();
      const response = await fetch("/api/presenter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ script, hostId: hostName.toLowerCase().replace(/\s+/g, "-"), hostName, voice, productName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to generate AI presenter.");
      setPresenterJobId(result.job?.id || "");
      setPresenterStatus(result.job?.status || "queued");
      setPresenterMediaUrl(result.job?.mediaUrl || "");
      setMessage(result.message || `AI presenter job: ${result.job?.status || "queued"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to generate AI presenter."); }
    finally { setGeneratingPresenter(false); }
  }

  async function generateScenePlan() {
    setGeneratingScenes(true); setMessage("");
    try {
      const response = await fetch("/api/scenes/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, layout, offerText, cta }),
      });
      const result = await response.json();
      if (!response.ok || !result.plan) throw new Error(result.error || "Unable to create scene plan.");
      setScenePlan(result.plan as ScenePlan);
      setMessage(`${result.plan.scenes.length} timed commerce scenes are ready.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create scene plan."); }
    finally { setGeneratingScenes(false); }
  }

  async function refreshPresenterStatus() {
    if (!presenterJobId) return;
    try {
      const { token } = await getToken();
      const response = await fetch(`/api/presenter/status?id=${encodeURIComponent(presenterJobId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to refresh presenter status.");
      const status = result.job?.status || presenterStatus;
      setPresenterStatus(status);
      if (result.job?.media_url) setPresenterMediaUrl(result.job.media_url);
      if (status === "ready") setMessage("AI presenter video is ready for broadcast.");
      if (status === "error") setMessage(result.job?.error_message || "AI presenter generation failed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to refresh presenter status."); }
  }

  async function launchBroadcast() {
    if (!user) return setMessage("Sign in before starting a broadcast.");
    if (!destinationId) return setMessage("Choose a connected broadcast destination.");
    if (!script.trim()) return setMessage("Prepare the sales script before launching.");
    if (!presenterJobId || presenterStatus !== "ready") return setMessage("Generate a ready AI presenter before broadcasting.");
    if (!scenePlan) return setMessage("Build the commerce scene plan before broadcasting.");
    setLaunching(true); setMessage("");
    try {
      const { token } = await getToken();
      const response = await fetch("/api/broadcast/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ destinationId, presenterJobId, scenePlan }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create broadcast job.");
      setBroadcastJobId(result.job?.id || "");
      setBroadcastStatus(result.job?.status || "ready");
      setMessage(result.message || `Broadcast job created with ${scenePlan.scenes.length} scenes: ${result.job?.status || "ready"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create broadcast job."); }
    finally { setLaunching(false); }
  }

  async function refreshBroadcastStatus() {
    if (!broadcastJobId) return;
    try {
      const { supabase } = await getToken();
      const { data, error } = await supabase.from("stream_jobs").select("status,error_message,updated_at").eq("id", broadcastJobId).single();
      if (error) throw error;
      setBroadcastStatus(data.status);
      if (data.status === "live") setMessage("Stream is LIVE with timed commerce overlays.");
      if (data.status === "ended") setMessage("Broadcast ended.");
      if (data.status === "error") setMessage(data.error_message || "Broadcast worker reported an error.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to refresh stream health."); }
  }

  async function stopBroadcast() {
    if (!broadcastJobId) return;
    setStopping(true); setMessage("");
    try {
      const { token } = await getToken();
      const response = await fetch("/api/broadcast/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId: broadcastJobId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to stop broadcast.");
      setBroadcastStatus("ended");
      setMessage("Broadcast stop requested.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to stop broadcast."); }
    finally { setStopping(false); }
  }

  return <div className="launchStudio">
    <div className="presenterPackage"><div><span>AI PRESENTER PACKAGE</span><strong>{hostName}</strong><small>{productName} · {layout}</small></div><div className="packageStatus">Presenter: {presenterStatus} · Scenes: {scenePlan?.scenes.length || 0} · Stream: {broadcastStatus}</div></div>
    <div className="launchControlGrid">
      <div className="integrationCard launchControlCard"><div className="integrationHeader"><Mic2 size={20}/><div><strong>AI Voice Preview</strong><span>Hear the selected presenter script before the stream.</span></div></div><div className="formStack"><select value={voice} onChange={(e) => setVoice(e.target.value)}>{VOICES.map((item) => <option key={item}>{item}</option>)}</select><button className="ghostButton" onClick={previewVoice} disabled={generatingVoice || !script.trim()}>{generatingVoice ? <LoaderCircle className="spin" size={17}/> : <Play size={17}/>} {generatingVoice ? "Generating..." : "Generate Voice Preview"}</button>{audioUrl && <audio className="voicePlayer" controls src={audioUrl}/>}</div></div>
      <div className="integrationCard launchControlCard"><div className="integrationHeader"><Video size={20}/><div><strong>AI Presenter Video</strong><span>Generate the avatar video and monitor asynchronous provider status.</span></div></div><div className="formStack"><button className="ghostButton" onClick={generatePresenter} disabled={generatingPresenter || !user || !script.trim()}>{generatingPresenter ? <LoaderCircle className="spin" size={17}/> : <Video size={17}/>} {generatingPresenter ? "Creating Presenter..." : "Generate AI Presenter"}</button><button className="ghostButton" onClick={refreshPresenterStatus} disabled={!presenterJobId || generatingPresenter}><RefreshCw size={16}/> Refresh Presenter Status</button><small className="helperText">Status: {presenterStatus}</small>{presenterMediaUrl && <video className="voicePlayer" controls src={presenterMediaUrl}/>}</div></div>
      <div className="integrationCard launchControlCard sceneCard"><div className="integrationHeader"><Layers size={20}/><div><strong>Commerce Scene Orchestration</strong><span>Sequence product, offer, and CTA overlays across the presenter video.</span></div></div><div className="formStack"><input value={offerText} onChange={(e) => { setOfferText(e.target.value); setScenePlan(null); }} placeholder="Featured offer"/><input value={cta} onChange={(e) => { setCta(e.target.value); setScenePlan(null); }} placeholder="Call to action"/><button className="ghostButton" onClick={generateScenePlan} disabled={generatingScenes}>{generatingScenes ? <LoaderCircle className="spin" size={17}/> : <Layers size={17}/>} {generatingScenes ? "Building Scenes..." : "Build Scene Plan"}</button>{scenePlan && <div className="sceneTimeline">{scenePlan.scenes.map((scene) => <div className="sceneChip" key={scene.id}><strong>{scene.title}</strong><span>{scene.start}s–{scene.end}s</span></div>)}</div>}</div></div>
      <div className="integrationCard launchControlCard"><div className="integrationHeader"><Radio size={20}/><div><strong>Broadcast & Stream Health</strong><span>Launch RTMP with the presenter and timed commerce overlays.</span></div></div><div className="formStack"><div className="destinationRow"><select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} disabled={!destinations.length}>{!destinations.length && <option value="">No connected destinations</option>}{destinations.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.provider}</option>)}</select><button className="ghostButton compact" onClick={loadDestinations} disabled={loadingDestinations || !user}>{loadingDestinations ? <LoaderCircle className="spin" size={16}/> : <RefreshCw size={16}/>}</button></div><button className="primaryButton full" onClick={launchBroadcast} disabled={launching || !user || !selectedDestination || presenterStatus !== "ready" || !scenePlan || ACTIVE_STREAM.has(broadcastStatus)}>{launching ? <LoaderCircle className="spin" size={18}/> : <Radio size={18}/>} {launching ? "Creating Broadcast Job..." : "Start Broadcast"}</button>{broadcastJobId && <button className="ghostButton full" onClick={refreshBroadcastStatus}><RefreshCw size={16}/> Refresh Stream Health</button>}{broadcastJobId && ACTIVE_STREAM.has(broadcastStatus) && <button className="ghostButton full" onClick={stopBroadcast} disabled={stopping}>{stopping ? <LoaderCircle className="spin" size={16}/> : <Square size={16}/>} {stopping ? "Stopping..." : "Stop Broadcast"}</button>}<small className="helperText">Stream status: {broadcastStatus}</small></div></div>
    </div>
    <p className="launchStatus">{message || "Preview the voice, generate the presenter, build the scene plan, confirm the destination, then launch the broadcast."}</p>
  </div>;
}
