"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { LoaderCircle, Mic2, Play, Radio, RefreshCw, Video } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Destination = { id: string; label: string; provider: string; status: string };
type Props = { user: User | null; script: string; productName: string; hostName: string; layout: string };
const VOICES = ["alloy", "ash", "coral", "echo", "nova", "onyx", "sage", "shimmer"];

export function StreamLaunchPanel({ user, script, productName, hostName, layout }: Props) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [audioUrl, setAudioUrl] = useState("");
  const [presenterJobId, setPresenterJobId] = useState("");
  const [presenterMediaUrl, setPresenterMediaUrl] = useState("");
  const [presenterStatus, setPresenterStatus] = useState("not-created");
  const [message, setMessage] = useState("");
  const [loadingDestinations, setLoadingDestinations] = useState(false);
  const [generatingVoice, setGeneratingVoice] = useState(false);
  const [generatingPresenter, setGeneratingPresenter] = useState(false);
  const [launching, setLaunching] = useState(false);

  const selectedDestination = useMemo(() => destinations.find((item) => item.id === destinationId) || null, [destinations, destinationId]);

  useEffect(() => {
    if (!user) { setDestinations([]); setDestinationId(""); return; }
    void loadDestinations();
  }, [user]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

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

  async function launchBroadcast() {
    if (!user) return setMessage("Sign in before starting a broadcast.");
    if (!destinationId) return setMessage("Choose a connected broadcast destination.");
    if (!script.trim()) return setMessage("Prepare the sales script before launching.");
    if (presenterJobId && presenterStatus !== "ready") return setMessage("The AI presenter must be ready before attaching it to the broadcast.");
    setLaunching(true); setMessage("");
    try {
      const { token } = await getToken();
      const response = await fetch("/api/broadcast/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ destinationId, presenterJobId: presenterStatus === "ready" ? presenterJobId : undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create broadcast job.");
      setMessage(result.message || `Broadcast job created: ${result.job?.status || "ready"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create broadcast job."); }
    finally { setLaunching(false); }
  }

  return <div className="launchStudio">
    <div className="presenterPackage"><div><span>AI PRESENTER PACKAGE</span><strong>{hostName}</strong><small>{productName} · {layout}</small></div><div className="packageStatus">{presenterStatus === "ready" ? "Video Ready" : "Voice Ready"}</div></div>
    <div className="launchControlGrid">
      <div className="integrationCard launchControlCard"><div className="integrationHeader"><Mic2 size={20}/><div><strong>AI Voice Preview</strong><span>Hear the selected presenter script before the stream.</span></div></div><div className="formStack"><select value={voice} onChange={(e) => setVoice(e.target.value)}>{VOICES.map((item) => <option key={item}>{item}</option>)}</select><button className="ghostButton" onClick={previewVoice} disabled={generatingVoice || !script.trim()}>{generatingVoice ? <LoaderCircle className="spin" size={17}/> : <Play size={17}/>} {generatingVoice ? "Generating..." : "Generate Voice Preview"}</button>{audioUrl && <audio className="voicePlayer" controls src={audioUrl}/>}</div></div>
      <div className="integrationCard launchControlCard"><div className="integrationHeader"><Video size={20}/><div><strong>AI Presenter Video</strong><span>Send the script, host, and voice to the configured avatar provider.</span></div></div><div className="formStack"><button className="ghostButton" onClick={generatePresenter} disabled={generatingPresenter || !user || !script.trim()}>{generatingPresenter ? <LoaderCircle className="spin" size={17}/> : <Video size={17}/>} {generatingPresenter ? "Creating Presenter..." : "Generate AI Presenter"}</button><small className="helperText">Status: {presenterStatus}</small>{presenterMediaUrl && <video className="voicePlayer" controls src={presenterMediaUrl}/>}</div></div>
      <div className="integrationCard launchControlCard"><div className="integrationHeader"><Radio size={20}/><div><strong>Broadcast Destination</strong><span>Select a connected RTMP destination and create the live job.</span></div></div><div className="formStack"><div className="destinationRow"><select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} disabled={!destinations.length}>{!destinations.length && <option value="">No connected destinations</option>}{destinations.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.provider}</option>)}</select><button className="ghostButton compact" onClick={loadDestinations} disabled={loadingDestinations || !user}>{loadingDestinations ? <LoaderCircle className="spin" size={16}/> : <RefreshCw size={16}/>}</button></div><button className="primaryButton full" onClick={launchBroadcast} disabled={launching || !user || !selectedDestination || !script.trim()}>{launching ? <LoaderCircle className="spin" size={18}/> : <Radio size={18}/>} {launching ? "Creating Broadcast Job..." : "Start Broadcast Job"}</button></div></div>
    </div>
    <p className="launchStatus">{message || "Preview the voice, generate the presenter, confirm the destination, then launch the broadcast job."}</p>
  </div>;
}
