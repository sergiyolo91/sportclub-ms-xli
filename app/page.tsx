'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dumbbell, Trophy, Users, LogOut, Plus, Flame, Scale } from 'lucide-react'
import DashboardLive from './dashboard-live'
import GroupPanel from './group-panel'

type GroupState = { id: string; name: string; invite_code: string; created_by: string; role: 'ADMIN' | 'MEMBER' } | null
type Exercise = { id: string; name: string; category: string; measurement_type: string }
type AuthMode = 'login' | 'signup'
type Tab = 'heute' | 'fortschritt' | 'rangliste' | 'gruppe'

type ProgressRow = {
  exercise_id: string
  exercise_name: string
  best_1rm: number
  best_weight: number | null
  best_reps: number | null
  last_at: string
}

type RankingRow = {
  user_id: string
  display_name: string
  score: number | null
  best_weight: number | null
  best_reps: number | null
  best_1rm: number | null
  last_at: string | null
  avatarUrl?: string | null
}

function softHaptic(ms = 8) {
  if (typeof navigator !== 'undefined') (navigator as any).vibrate?.(ms)
}

export default function HomePage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [profileName, setProfileName] = useState('')
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
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
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    if (!user) {
      setGroup(null)
      setExercises([])
      setProfileAvatarUrl(null)
      return
    }
    void loadUserData()
  }, [user])

  async function signedAvatar(path: string | null) {
    if (!path) return null
    const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60)
    return data?.signedUrl ?? null
  }

  async function refreshOwnProfile() {
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('display_name,avatar_url').eq('id', user.id).maybeSingle()
    setProfileName(profile?.display_name || user.user_metadata?.display_name || 'Sportler')
    setProfileAvatarUrl(await signedAvatar(profile?.avatar_url || null))
  }

  async function refreshExercises() {
    const { data } = await supabase.from('exercises').select('id,name,category,measurement_type').eq('is_active', true).order('category').order('name')
    setExercises((data as Exercise[]) || [])
  }

  async function loadUserData() {
    setLoading(true)
    const [{ data: profile }, { data: membership }, { data: exerciseRows }] = await Promise.all([
      supabase.from('profiles').select('display_name,avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('group_members').select('group_id, role, groups(id,name,invite_code,created_by)').eq('user_id', user.id).limit(1).maybeSingle(),
      supabase.from('exercises').select('id,name,category,measurement_type').eq('is_active', true).order('category').order('name'),
    ])
    setProfileName(profile?.display_name || user.user_metadata?.display_name || 'Sportler')
    setProfileAvatarUrl(await signedAvatar(profile?.avatar_url || null))
    setExercises((exerciseRows as Exercise[]) || [])
    const rawGroup: any = membership?.groups
    const g = Array.isArray(rawGroup) ? rawGroup[0] : rawGroup
    setGroup(membership && g ? { id: g.id, name: g.name, invite_code: g.invite_code, created_by: g.created_by, role: membership.role } : null)
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

  function selectTab(next: Tab) {
    if (next !== tab) softHaptic()
    setTab(next)
  }

  if (loading) return <main className="center-page"><div className="loader"/><p>Lade Sportclub …</p></main>

  if (!user) {
    return <main className="auth-page">
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
  }

  if (!group) {
    return <main className="onboarding-page">
      <div className="topbar simple"><div><div className="eyebrow">Willkommen, {profileName}</div><h1>Deine Gruppe</h1></div><button className="icon-btn" onClick={signOut}><LogOut size={20}/></button></div>
      <p className="lead">Erstelle eure private Fitnessgruppe oder tritt mit einem Einladungscode bei.</p>
      <section className="choice-card sage-card">
        <div className="choice-icon"><Users size={24}/></div><h2>Gruppe erstellen</h2><p>Du wirst automatisch Admin und kannst anschließend deine Freunde einladen.</p>
        <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Gruppenname" />
        <button className="primary-btn" onClick={createGroup} disabled={busy}><Plus size={18}/> Gruppe erstellen</button>
      </section>
      <section className="choice-card rose-card">
        <div className="choice-icon"><Dumbbell size={24}/></div><h2>Gruppe beitreten</h2><p>Gib den Code ein, den dir ein Mitglied deiner Gruppe geschickt hat.</p>
        <input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="Einladungscode" />
        <button className="secondary-btn" onClick={joinGroup} disabled={busy}>Beitreten</button>
      </section>
      {message && <p className="notice">{message}</p>}
    </main>
  }

  return <main className="shell">
    <header className="topbar app-topbar">
      <div><div className="eyebrow">{group.name}</div><h1 className="title">Hallo {profileName}.</h1></div>
      <button className="avatar-btn" onClick={() => selectTab('gruppe')} aria-label="Profil öffnen">{profileAvatarUrl ? <img src={profileAvatarUrl} alt="" className="avatar-btn-image"/> : profileName.slice(0,1).toUpperCase()}</button>
    </header>

    <div className="tab-stage" key={tab}>
      {tab === 'heute' && <DashboardLive userId={user.id} group={group} exercises={exercises} />}
      {tab === 'fortschritt' && <ProgressScreen userId={user.id} exercises={exercises} />}
      {tab === 'rangliste' && <RankingScreen groupId={group.id} exercises={exercises} />}
      {tab === 'gruppe' && <GroupPanel userId={user.id} group={group} onLogout={signOut} onProfileUpdated={refreshOwnProfile} onExercisesUpdated={refreshExercises} />}
    </div>

    <nav className="bottom-nav">
      <NavButton active={tab === 'heute'} onClick={() => selectTab('heute')} icon={<Dumbbell size={20}/>} label="Heute" />
      <NavButton active={tab === 'fortschritt'} onClick={() => selectTab('fortschritt')} icon={<Flame size={20}/>} label="Fortschritt" />
      <NavButton active={tab === 'rangliste'} onClick={() => selectTab('rangliste')} icon={<Trophy size={20}/>} label="Rangliste" />
      <NavButton active={tab === 'gruppe'} onClick={() => selectTab('gruppe')} icon={<Users size={20}/>} label="Gruppe" />
    </nav>
  </main>
}

function ProgressScreen({ userId, exercises }: { userId: string; exercises: Exercise[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<ProgressRow[]>([])
  const [weight, setWeight] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => { void load() }, [])

  async function load() {
    const { data } = await supabase.from('workout_set_details')
      .select('exercise_id,exercise_name,estimated_1rm,weight_kg,repetitions,completed_at')
      .eq('user_id', userId)
      .not('estimated_1rm', 'is', null)
      .order('completed_at', { ascending: false })
    const byExercise = new Map<string, ProgressRow>()
    for (const row of (data || []) as any[]) {
      const current = byExercise.get(row.exercise_id)
      if (!current || Number(row.estimated_1rm) > current.best_1rm) {
        byExercise.set(row.exercise_id, {
          exercise_id: row.exercise_id,
          exercise_name: row.exercise_name,
          best_1rm: Number(row.estimated_1rm),
          best_weight: row.weight_kg == null ? null : Number(row.weight_kg),
          best_reps: row.repetitions,
          last_at: row.completed_at,
        })
      }
    }
    setRows([...byExercise.values()].sort((a,b) => b.best_1rm - a.best_1rm))
  }

  async function saveWeight() {
    const value = Number(weight.replace(',','.'))
    if (!value || value <= 0) return
    const { error } = await supabase.from('body_weights').insert({ user_id: userId, weight_kg: value })
    setStatus(error ? error.message : 'Körpergewicht gespeichert. Es bleibt für andere verborgen.')
    if (!error) {
      setWeight('')
      softHaptic(12)
    }
  }

  return <section className="screen-pad">
    <div className="eyebrow">Dein Fortschritt</div><h2 className="screen-title">Stärker als gestern.</h2>
    <div className="weight-card"><Scale size={22}/><div><strong>Körpergewicht</strong><small>Nur für dich sichtbar · für relative Rangliste intern genutzt</small></div></div>
    <div className="weight-entry"><input inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder="z. B. 82,5 kg"/><button onClick={saveWeight}>Speichern</button></div>
    {status && <p className="notice">{status}</p>}
    {rows.length === 0 ? <div className="podium-empty"><Flame size={32}/><strong>Noch keine Kraftdaten.</strong><p>Nach deinem ersten Training erscheinen hier deine besten Leistungen.</p></div> : <div className="progress-list">
      {rows.map(row => <div className="progress-item" key={row.exercise_id}><div><strong>{row.exercise_name}</strong><small>bestes geschätztes 1RM</small></div><div className="progress-value"><strong>{row.best_1rm.toFixed(1)}<em> kg</em></strong><span>{row.best_weight ?? '–'} kg × {row.best_reps ?? '–'}</span></div></div>)}
    </div>}
  </section>
}

function RankingScreen({ groupId, exercises }: { groupId: string; exercises: Exercise[] }) {
  const supabase = useMemo(() => createClient(), [])
  const weighted = exercises.filter(e => e.measurement_type === 'WEIGHT_REPS')
  const [exerciseId, setExerciseId] = useState(weighted[0]?.id ?? '')
  const [mode, setMode] = useState<'performance'|'relative'|'progress'>('performance')
  const [rows, setRows] = useState<RankingRow[]>([])

  useEffect(() => { if (exerciseId) void load() }, [exerciseId, mode])

  async function load() {
    const { data } = await supabase.rpc('get_group_ranking', { p_group_id: groupId, p_exercise_id: exerciseId, p_mode: mode })
    const rankingRows = ((data as RankingRow[]) || []).map(row => ({ ...row, avatarUrl: null }))
    const userIds = rankingRows.map(row => row.user_id)
    if (!userIds.length) {
      setRows([])
      return
    }

    const { data: profiles } = await supabase.from('profiles').select('id,avatar_url').in('id', userIds)
    const avatarPairs = await Promise.all((profiles || []).map(async (profile: any) => {
      if (!profile.avatar_url) return [profile.id, null] as const
      const { data: signed } = await supabase.storage.from('avatars').createSignedUrl(profile.avatar_url, 60 * 60)
      return [profile.id, signed?.signedUrl ?? null] as const
    }))
    const avatarMap = new Map<string, string | null>(avatarPairs)
    setRows(rankingRows.map(row => ({ ...row, avatarUrl: avatarMap.get(row.user_id) ?? null })))
  }

  function scoreText(row: RankingRow) {
    if (row.score == null) return '–'
    if (mode === 'relative') return `${Number(row.score).toFixed(2)} × KG`
    if (mode === 'progress') return `${Number(row.score) >= 0 ? '+' : ''}${Number(row.score).toFixed(1)} %`
    return `${Number(row.score).toFixed(1)} kg`
  }

  function rankingAvatar(row: RankingRow, large = false) {
    return <div className={`rank-avatar ${large ? 'rank-avatar-large' : ''}`}>{row.avatarUrl ? <img src={row.avatarUrl} alt=""/> : <span>{row.display_name.slice(0,1).toUpperCase()}</span>}</div>
  }

  const leaders = rows.slice(0, 3)
  const rest = rows.slice(3)

  return <section className="screen-pad">
    <div className="eyebrow">Gemeinsam stärker.</div><h2 className="screen-title">Rangliste</h2>
    <div className="ranking-control-card">
      <select className="select-input" value={exerciseId} onChange={e => setExerciseId(e.target.value)}>{weighted.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}</select>
      <div className="ranking-tabs">
        <button className={mode === 'performance' ? 'active' : ''} onClick={() => { setMode('performance'); softHaptic() }}>Leistung</button>
        <button className={mode === 'relative' ? 'active' : ''} onClick={() => { setMode('relative'); softHaptic() }}>Relativ</button>
        <button className={mode === 'progress' ? 'active' : ''} onClick={() => { setMode('progress'); softHaptic() }}>+90 Tage</button>
      </div>
    </div>

    {rows.length === 0 ? <div className="podium-empty"><Trophy size={34}/><strong>Die Rangliste wartet auf eure ersten Trainings.</strong></div> : <>
      <div className="podium-board">
        {leaders[0] && <div className="leader-card leader-first">
          <div className="leader-place"><Trophy size={16}/> Platz 1</div>
          {rankingAvatar(leaders[0], true)}
          <div className="leader-copy"><strong>{leaders[0].display_name}</strong><small>{leaders[0].best_weight ?? '–'} kg × {leaders[0].best_reps ?? '–'} Wdh.</small></div>
          <div className="leader-score">{scoreText(leaders[0])}</div>
        </div>}
        {leaders.length > 1 && <div className="podium-followers">
          {leaders.slice(1).map((row, index) => <div className="leader-card leader-compact" key={row.user_id}>
            <div className="leader-place">Platz {index + 2}</div>
            {rankingAvatar(row)}
            <div className="leader-copy"><strong>{row.display_name}</strong><small>{row.best_weight ?? '–'} kg × {row.best_reps ?? '–'}</small></div>
            <div className="leader-score">{scoreText(row)}</div>
          </div>)}
        </div>}
      </div>
      {rest.length > 0 && <div className="ranking-list ranking-rest">
        {rest.map((row, index) => <div className="ranking-row" key={row.user_id}><div className="rank-number">{index + 4}</div>{rankingAvatar(row)}<div className="rank-person"><strong>{row.display_name}</strong><small>{row.best_weight ?? '–'} kg × {row.best_reps ?? '–'} Wdh.</small></div><div className="rank-score">{scoreText(row)}</div></div>)}
      </div>}
    </>}
  </section>
}

function NavButton({ active, onClick, icon, label }: { active:boolean; onClick:()=>void; icon:React.ReactNode; label:string }) {
  return <button className={`nav-btn ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}
