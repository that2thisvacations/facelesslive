import { BarChart3, Bot, Clapperboard, MessageSquareText, PackageSearch, Radio, Sparkles } from "lucide-react";

const modules = [
  { name: "Live Studio", description: "Build and control faceless product streams.", icon: Radio },
  { name: "AI Hosts", description: "Choose the presenter, voice, and selling style.", icon: Bot },
  { name: "Products", description: "Import products and organize live campaigns.", icon: PackageSearch },
  { name: "Script Studio", description: "Generate hooks, demos, FAQs, and offers.", icon: Sparkles },
  { name: "Chat AI", description: "Prepare automated answers for viewer questions.", icon: MessageSquareText },
  { name: "Content", description: "Turn livestreams into clips and social assets.", icon: Clapperboard },
  { name: "Analytics", description: "Track viewers, clicks, sales, and conversion.", icon: BarChart3 },
];

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brandMark">F</span><span>FacelessLive</span></div>
        <button className="secondaryButton">Join Early Access</button>
      </header>

      <section className="hero">
        <p className="eyebrow">AI-POWERED LIVE COMMERCE</p>
        <h1>Go Live. Stay Faceless. <span>Sell More.</span></h1>
        <p className="heroCopy">Build product livestreams with AI hosts, automated scripts, intelligent audience engagement, and performance analytics without stepping on camera.</p>
        <div className="heroActions">
          <button className="primaryButton">Create Your First Stream</button>
          <button className="ghostButton">Explore the Platform</button>
        </div>
      </section>

      <section className="workspace">
        <div className="sectionHeading">
          <div><p className="eyebrow">FOUNDATION</p><h2>Your faceless selling command center</h2></div>
          <span className="status"><i />Foundation active</span>
        </div>
        <div className="moduleGrid">
          {modules.map(({ name, description, icon: Icon }) => (
            <article className="moduleCard" key={name}>
              <div className="iconBox"><Icon size={22} /></div>
              <h3>{name}</h3>
              <p>{description}</p>
              <span>Coming into build →</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
