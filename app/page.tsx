import { ChevronRight, Dumbbell, Flame, Trophy } from 'lucide-react'

const workouts = [
  ['Training A', 'Oberkörper · 5 Übungen'],
  ['Training B', 'Rücken & Arme · 6 Übungen'],
  ['Training C', 'Beine · 5 Übungen'],
]

export default function HomePage() {
  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <div className="eyebrow">Sportclub MS XLI</div>
          <h1 className="title">Hallo Serge.</h1>
        </div>
        <div className="pill">MS XLI</div>
      </div>

      <section className="card hero">
        <div className="eyebrow">Heute trainieren</div>
        <div className="workout">
          <div><strong>Training A</strong><br/><small>Oberkörper · 5 Übungen</small></div>
          <ChevronRight size={20}/>
        </div>
        <button className="cta">Training starten</button>
      </section>

      <section className="section">
        <h2>Deine Woche</h2>
        <div className="grid">
          <div className="metric"><strong>3</strong><span>Trainings</span></div>
          <div className="metric"><strong>2</strong><span>PRs</span></div>
          <div className="metric"><strong>1</strong><span>Bonus</span></div>
        </div>
      </section>

      <section className="section card">
        <h2>Deine Trainings</h2>
        {workouts.map(([name, meta]) => (
          <div className="workout" key={name}>
            <div><strong>{name}</strong><br/><small>{meta}</small></div>
            <ChevronRight size={18}/>
          </div>
        ))}
        <div className="workout">
          <div><strong>+ Zuhause</strong><br/><small>Eigenes Workout starten</small></div>
          <ChevronRight size={18}/>
        </div>
      </section>

      <section className="section card challenge">
        <div className="eyebrow">Wochenbonus</div>
        <h2 style={{fontSize:22, marginTop:6}}>3 × 50 Liegestütze</h2>
        <p className="muted">7 von 10 Mitgliedern erledigt</p>
        <button className="cta"><Flame size={17} style={{marginRight:8}}/> Bonus machen</button>
      </section>

      <section className="section card">
        <h2>MS XLI Aktivität</h2>
        <div className="activity"><div className="dot"><Trophy size={17}/></div><div><strong>Marc · neuer PR</strong><br/><span className="muted">Bankdrücken · 95 kg × 6</span></div></div>
        <div className="activity"><div className="dot"><Dumbbell size={17}/></div><div><strong>Tim · Zuhause trainiert</strong><br/><span className="muted">Push Zuhause · 5 Übungen</span></div></div>
      </section>

      <nav className="bottom">
        <div className="nav active">Heute</div>
        <div className="nav">Fortschritt</div>
        <div className="nav">Rangliste</div>
        <div className="nav">Gruppe</div>
      </nav>
    </main>
  )
}
