'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dumbbell, Trophy, Users, LogOut, Plus, ChevronRight, Flame } from 'lucide-react'

type GroupState = {
  id: string
  name: string
  invite_code: string
  role: 'ADMIN' | 'MEMBER'
} | null

type Exercise = { id: string; name: string; category: string; measurement_type: string }

type AuthMode = 'login' | 'signup'
type Tab = 'heute' | 'fortschritt' | 'rangliste' | 'gruppe'

export default function HomePage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [profileName, setProfileName] = useState('')
  const [group, setGroup] = useState<GroupState>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [tab, setTab] = useState<Tab>('heute')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [groupName, setGroupName] = useState('MS XLI')
  const [inviteCode, setInviteCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => data.subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    if (!user) {
      setGroup(null)
      setExercises([])
      return
    }
    void loadUserData()
  }, [user])

  async function loadUserData() {
    setLoading(true)
    const [{ data: profile }, { data: membership }, { data: exerciseRows }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      supabase.from('group_members').select('group_id, role, groups(id,name,invite_code)').eq('user_id', user.id).limit(1).maybeSingle(),
      supabase.from('exercises').select('id,name,category,measurement_type').eq('is_active', true).order('category').order('name'),
    ])

    setProfileName(profile?.display_name || user.user_metadata?.display_name || 'Sportler')
    setExercises((exerciseRows as Exercise[]) || [])

    const rawGroup: any = membership?.groups
    const g = Array.isArray(rawGroup) ? rawGroup[0] : rawGroup
    if (membership && g) {
      setGroup({ id: g.id, name: g.name, invite_code: g.invite_code, role: membership.role })
    } else {
      setGroup(null)
    }
    setLoading(false)
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName.trim() || 'Sportler' } },
        })
        if (error) throw error
        if (!data.session) setMessage('Account erstellt. Bitte bestätige ggf. die E-Mail und melde dich danach an.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: any) {
      setMessage(err.message || 'Das hat leider nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  async function createGroup() {
    if (!groupName.trim()) return
    setBusy(true)
    setMessage('')
    const { error } = await supabase.rpc('create_group', { group_name: groupName.trim() })
    if (error) setMessage(error.message)
    else await loadUserData()
    setBusy(false)
  }

  async function joinGroup() {
    if (!inviteCode.trim()) return
    setBusy(true)
    setMessage('')
    const { error } = await supabase.rpc('join_group_by_code', { code: inviteCode.trim().toUpperCase() })
    if (error) setMessage(error.message)
    else await loadUserData()
    setBusy(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setTab('heute')
  }

  if (loading) return <main className="center-page"><div className="loader"/><p>Lade Sportclub …</p></main>

  if (!user) {
    return (
      <main className="auth-page">
        <div className="brand-mark"><Dumbbell size={30}/></div>
        <div className="brand-kicker">SPORTCLUB</div>
        <h1 className="brand-title">MS XLI</h1>
        <p className="brand-copy">Trainieren. Eintragen. Fortschritt sehen.<br/>Gemeinsam stärker.</p>

        <section className="auth-card">
          <div className="segmented">
            <button className={authMode === 'login' ? 'selected' : ''} onClick={() => setAuthMode('login')}>Anmelden</button>
            <button className={authMode === 'signup' ? 'selected' : ''} onClick={() => setAuthMode('signup')}>Account erstellen</button>
          </div>
          <form onSubmit={handleAuth} className="stack">
            {authMode === 'signup' && <input placeholder="Dein Name" value={displayName} onChange={e => setDisplayName(e.target.value)} required />}
            <input type="email" placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
            <button className="primary-btn" disabled={busy}>{busy ? 'Einen Moment …' : authMode === 'login' ? 'Anmelden' : 'Account erstellen'}</button>
          </form>
          {message && <p className="notice">{message}</p>}
        </section>
      </main>
    )
  }

  if (!group) {
    return (
      <main className="onboarding-page">
        <div className="topbar simple"><div><div className="eyebrow">Willkommen, {profileName}</div><h1>Deine Gruppe</h1></div><button className="icon-btn" onClick={signOut}><LogOut size={20}/></button></div>
        <p className="lead">Erstelle eure private Fitnessgruppe oder tritt mit einem Einladungscode bei.</p>

        <section className="choice-card sage-card">
          <div className="choice-icon"><Users size={24}/></div>
          <h2>Gruppe erstellen</h2>
          <p>Du wirst automatisch Admin und kannst anschließend deine Freunde einladen.</p>
          <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Gruppenname" />
          <button className="primary-btn" onClick={createGroup} disabled={busy}><Plus size={18}/> Gruppe erstellen</button>
        </section>

        <section className="choice-card rose-card">
          <div className="choice-icon"><Dumbbell size={24}/></div>
          <h2>Gruppe beitreten</h2>
          <p>Gib den Code ein, den dir ein Mitglied deiner Gruppe geschickt hat.</p>
          <input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="z. B. MSXLI-8472" />
          <button className="secondary-btn" onClick={joinGroup} disabled={busy}>Beitreten</button>
        </section>
        {message && <p className="notice">{message}</p>}
      </main>
    )
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div><div className="eyebrow">{group.name}</div><h1 className="title">Hallo {profileName}.</h1></div>
        <button className="avatar-btn" onClick={() => setTab('gruppe')}>{profileName.slice(0,1).toUpperCase()}</button>
      </header>

      {tab === 'heute' && <Today group={group} exercises={exercises} />}
      {tab === 'fortschritt' && <ProgressPlaceholder />}
      {tab === 'rangliste' && <RankingPlaceholder />}
      {tab === 'gruppe' && <GroupScreen group={group} profileName={profileName} onLogout={signOut} />}

      <nav className="bottom-nav">
        <NavButton active={tab === 'heute'} onClick={() => setTab('heute')} icon={<Dumbbell size={20}/>} label="Heute" />
        <NavButton active={tab === 'fortschritt'} onClick={() => setTab('fortschritt')} icon={<Flame size={20}/>} label="Fortschritt" />
        <NavButton active={tab === 'rangliste'} onClick={() => setTab('rangliste')} icon={<Trophy size={20}/>} label="Rangliste" />
        <NavButton active={tab === 'gruppe'} onClick={() => setTab('gruppe')} icon={<Users size={20}/>} label="Gruppe" />
      </nav>
    </main>
  )
}

function Today({ group, exercises }: { group: NonNullable<GroupState>; exercises: Exercise[] }) {
  return <>
    <section className="hero-card">
      <div className="eyebrow">Heute trainieren</div>
      <h2>Bereit für die nächste Runde?</h2>
      <p>Trainingsvorlagen kommen im nächsten Schritt. Die Übungsbibliothek ist bereits mit {exercises.length} Übungen verbunden.</p>
      <button className="primary-btn"><Dumbbell size={18}/> Training starten</button>
    </section>

    <section className="section-block">
      <div className="section-heading"><h2>Deine Woche</h2><span>Aktuell</span></div>
      <div className="metric-grid">
        <div className="metric-card yellow"><strong>0</strong><span>Trainings</span></div>
        <div className="metric-card lilac"><strong>0</strong><span>PRs</span></div>
        <div className="metric-card rose"><strong>0</strong><span>Bonus</span></div>
      </div>
    </section>

    <section className="challenge-card">
      <div><div className="eyebrow">Wochenbonus</div><h2>Die erste Challenge wartet</h2><p>Ein Admin kann bald eine Gruppen-Challenge anlegen.</p></div>
      <div className="progress-line"><span style={{width:'0%'}}/></div>
    </section>

    <section className="list-card">
      <div className="section-heading"><h2>Übungsbibliothek</h2><span>{exercises.length} Übungen</span></div>
      {exercises.slice(0,5).map(ex => <div className="row" key={ex.id}><div><strong>{ex.name}</strong><small>{ex.category}</small></div><ChevronRight size={18}/></div>)}
    </section>
  </>
}

function ProgressPlaceholder() {
  return <section className="screen-pad"><div className="eyebrow">Dein Fortschritt</div><h2 className="screen-title">Noch keine Trainingsdaten.</h2><p className="lead">Sobald du Sätze speicherst, erscheinen hier Verlauf, persönliche Rekorde und dein geschätztes 1RM.</p><div className="empty-chart"><div className="chart-line"/></div></section>
}

function RankingPlaceholder() {
  return <section className="screen-pad"><div className="eyebrow">MS XLI</div><h2 className="screen-title">Rangliste</h2><div className="ranking-tabs"><span className="active">Leistung</span><span>Relativ</span><span>+90 Tage</span></div><div className="podium-empty"><Trophy size={34}/><strong>Die Rangliste füllt sich nach euren ersten Trainings.</strong><p>Verglichen werden später Leistung, Kraft im Verhältnis zum Körpergewicht und Fortschritt.</p></div></section>
}

function GroupScreen({ group, profileName, onLogout }: { group: NonNullable<GroupState>; profileName: string; onLogout: () => void }) {
  return <section className="screen-pad"><div className="eyebrow">Deine Gruppe</div><h2 className="screen-title">{group.name}</h2><div className="group-code"><span>Einladungscode</span><strong>{group.invite_code}</strong><small>Zum Einladen einfach weitergeben</small></div><div className="list-card"><div className="row"><div><strong>{profileName}</strong><small>{group.role === 'ADMIN' ? 'Admin' : 'Mitglied'}</small></div><div className="mini-avatar">{profileName.slice(0,1).toUpperCase()}</div></div></div><button className="logout-btn" onClick={onLogout}><LogOut size={18}/> Abmelden</button></section>
}

function NavButton({ active, onClick, icon, label }: { active:boolean; onClick:()=>void; icon:React.ReactNode; label:string }) {
  return <button className={`nav-btn ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}
