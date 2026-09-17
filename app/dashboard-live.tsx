'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, ChevronRight, Dumbbell, Flame, Home, RefreshCw, Trophy } from 'lucide-react'
import TrainingPanel from './training-panel'

type Exercise = { id: string; name: string; category: string; measurement_type: string }
type Group = { id: string; name: string; invite_code: string; role: 'ADMIN' | 'MEMBER' }

type FeedItem = {
  id: string
  userId: string
  name: string
  avatarUrl: string | null
  type: string
  title: string
  detail: string
  createdAt: string
}

type Challenge = {
  id: string
  title: string
  description: string | null
  target_count: number | null
  completed: number
  members: number
  ownCompleted: boolean
}

function pulseHaptic(ms = 10) {
  if (typeof navigator !== 'undefined') (navigator as any).vibrate?.(ms)
}

export default function DashboardLive({ userId, group, exercises }: { userId: string; group: Group; exercises: Exercise[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState({ workouts: 0, prs: 0, bonus: 0 })
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loading, setLoading] = useState(true)
  const [challengeBusy, setChallengeBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const monday = new Date()
    const day = monday.getDay()
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1))
    monday.setHours(0, 0, 0, 0)
    const weekStart = monday.toISOString()
    const now = new Date().toISOString()

    const [workouts, prs, bonus, activityRows, challengeRows, members] = await Promise.all([
      supabase.from('workouts').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('finished_at', 'is', null).gte('finished_at', weekStart),
      supabase.from('activities').select('id', { count: 'exact', head: true }).eq('group_id', group.id).eq('user_id', userId).eq('activity_type', 'PERSONAL_RECORD').gte('created_at', weekStart),
      supabase.from('activities').select('id', { count: 'exact', head: true }).eq('group_id', group.id).eq('user_id', userId).in('activity_type', ['BONUS_COMPLETED', 'CHALLENGE_COMPLETED']).gte('created_at', weekStart),
      supabase.from('activities').select('id,user_id,activity_type,workout_id,challenge_id,exercise_id,created_at').eq('group_id', group.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('challenges').select('id,title,description,target_count,starts_at,ends_at').eq('group_id', group.id).lte('starts_at', now).or(`ends_at.is.null,ends_at.gte.${now}`).order('starts_at', { ascending: false }).limit(1),
      supabase.from('group_members').select('user_id', { count: 'exact' }).eq('group_id', group.id),
    ])

    setStats({ workouts: workouts.count || 0, prs: prs.count || 0, bonus: bonus.count || 0 })

    const activities = (activityRows.data || []) as any[]
    const userIds = [...new Set(activities.map(a => a.user_id).filter(Boolean))]
    const workoutIds = [...new Set(activities.map(a => a.workout_id).filter(Boolean))]
    const exerciseIds = [...new Set(activities.map(a => a.exercise_id).filter(Boolean))]
    const challengeIds = [...new Set(activities.map(a => a.challenge_id).filter(Boolean))]

    const [profiles, workoutData, exerciseData, challengeData] = await Promise.all([
      userIds.length ? supabase.from('profiles').select('id,display_name,avatar_url').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
      workoutIds.length ? supabase.from('workouts').select('id,title,workout_type').in('id', workoutIds) : Promise.resolve({ data: [] as any[] }),
      exerciseIds.length ? supabase.from('exercises').select('id,name').in('id', exerciseIds) : Promise.resolve({ data: [] as any[] }),
      challengeIds.length ? supabase.from('challenges').select('id,title').in('id', challengeIds) : Promise.resolve({ data: [] as any[] }),
    ])

    const nameMap = new Map((profiles.data || []).map((p: any) => [p.id, p.display_name]))
    const avatarPairs = await Promise.all((profiles.data || []).map(async (profile: any) => {
      if (!profile.avatar_url) return [profile.id, null] as const
      const { data: signed } = await supabase.storage.from('avatars').createSignedUrl(profile.avatar_url, 60 * 60)
      return [profile.id, signed?.signedUrl ?? null] as const
    }))
    const avatarMap = new Map<string, string | null>(avatarPairs)
    const workoutMap = new Map((workoutData.data || []).map((w: any) => [w.id, w]))
    const exerciseMap = new Map((exerciseData.data || []).map((e: any) => [e.id, e.name]))
    const challengeMap = new Map((challengeData.data || []).map((c: any) => [c.id, c.title]))

    setFeed(activities.map((a: any) => {
      const name = nameMap.get(a.user_id) || 'Mitglied'
      const avatarUrl = avatarMap.get(a.user_id) ?? null
      const workout = a.workout_id ? workoutMap.get(a.workout_id) : null
      const exercise = a.exercise_id ? exerciseMap.get(a.exercise_id) : null
      const challengeTitle = a.challenge_id ? challengeMap.get(a.challenge_id) : null
      if (a.activity_type === 'PERSONAL_RECORD') return { id: a.id, userId: a.user_id, name, avatarUrl, type: a.activity_type, title: `${name} · neuer PR`, detail: exercise || 'Persönlicher Rekord', createdAt: a.created_at }
      if (a.activity_type === 'HOME_WORKOUT_COMPLETED') return { id: a.id, userId: a.user_id, name, avatarUrl, type: a.activity_type, title: `${name} · Zuhause trainiert`, detail: workout?.title || 'Home-Workout', createdAt: a.created_at }
      if (a.activity_type === 'CHALLENGE_COMPLETED') return { id: a.id, userId: a.user_id, name, avatarUrl, type: a.activity_type, title: `${name} · Challenge geschafft`, detail: challengeTitle || 'Wochenchallenge', createdAt: a.created_at }
      return { id: a.id, userId: a.user_id, name, avatarUrl, type: a.activity_type, title: `${name} · Training abgeschlossen`, detail: workout?.title || 'Training', createdAt: a.created_at }
    }))

    const activeChallenge = challengeRows.data?.[0] as any
    if (activeChallenge) {
      const { data: entries } = await supabase.from('challenge_entries').select('user_id,completed_at').eq('challenge_id', activeChallenge.id)
      const completed = (entries || []).filter((e: any) => e.completed_at).length
      const ownCompleted = (entries || []).some((e: any) => e.user_id === userId && e.completed_at)
      setChallenge({
        id: activeChallenge.id,
        title: activeChallenge.title,
        description: activeChallenge.description,
        target_count: activeChallenge.target_count,
        completed,
        members: members.count || 0,
        ownCompleted,
      })
    } else {
      setChallenge(null)
    }
    setLoading(false)
  }, [group.id, supabase, userId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 12000)
    return () => window.clearInterval(timer)
  }, [load])

  async function completeChallenge() {
    if (!challenge || challenge.ownCompleted) return
    setChallengeBusy(true)
    const { error } = await supabase.rpc('complete_challenge', { p_challenge_id: challenge.id })
    if (!error) {
      pulseHaptic(18)
      await load()
    }
    setChallengeBusy(false)
  }

  function when(iso: string) {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
    if (minutes < 1) return 'gerade eben'
    if (minutes < 60) return `vor ${minutes} Min.`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `vor ${hours} Std.`
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(iso))
  }

  const activePeople = [...new Map(feed.map(item => [item.userId, item])).values()].slice(0, 5)

  return <>
    <section className="hero-card training-hero">
      <div className="hero-topline"><div className="eyebrow">Heute trainieren</div><span className="hero-badge">{stats.workouts} diese Woche</span></div>
      <h2>Was steht heute an?</h2>
      <p>Trainingstag wählen, loslegen und Satz für Satz durchgehen.</p>
      <TrainingPanel userId={userId} groupId={group.id} exercises={exercises} />
    </section>

    <section className="section-block week-block">
      <div className="section-heading"><div><span className="section-kicker">Dein Rhythmus</span><h2>Diese Woche</h2></div><button className="tiny-refresh" onClick={() => void load()} aria-label="Aktualisieren"><RefreshCw size={14}/>{loading ? 'Lädt …' : 'Aktuell'}</button></div>
      <div className="metric-grid">
        <div className="metric-card metric-neutral"><strong>{stats.workouts}</strong><span>Trainings</span></div>
        <div className="metric-card metric-neutral"><strong>{stats.prs}</strong><span>Neue PRs</span></div>
        <div className="metric-card metric-accent"><strong>{stats.bonus}</strong><span>Bonus</span></div>
      </div>
      {activePeople.length > 0 && <div className="active-strip">
        <div className="active-avatars">{activePeople.map(person => person.avatarUrl ? <img key={person.userId} src={person.avatarUrl} alt=""/> : <span key={person.userId}>{person.name.slice(0,1).toUpperCase()}</span>)}</div>
        <div><strong>Zuletzt aktiv</strong><small>{activePeople.map(person => person.name).join(' · ')}</small></div>
      </div>}
    </section>

    {challenge ? <section className="challenge-card">
      <div className="challenge-top"><div><div className="eyebrow">Wochenchallenge</div><h2>{challenge.title}</h2></div><Flame size={24}/></div>
      {challenge.description && <p>{challenge.description}</p>}
      <div className="challenge-status"><span>{challenge.completed} von {challenge.members || '–'} erledigt</span><strong>{challenge.members ? Math.round((challenge.completed / challenge.members) * 100) : 0}%</strong></div>
      <div className="progress-line"><span style={{width: `${challenge.members ? Math.min(100, (challenge.completed / challenge.members) * 100) : 0}%`}}/></div>
      <button className={challenge.ownCompleted ? 'challenge-done' : 'challenge-action'} onClick={completeChallenge} disabled={challengeBusy || challenge.ownCompleted}>{challenge.ownCompleted ? <><Check size={17}/> Erledigt</> : <><Flame size={17}/> Challenge geschafft</>}</button>
    </section> : <section className="challenge-card challenge-quiet">
      <div className="eyebrow">Wochenchallenge</div><h2>Noch keine Challenge aktiv</h2><p>{group.role === 'ADMIN' ? 'Unter Gruppe kannst du eine kleine Challenge für alle starten.' : 'Sobald ein Admin eine Challenge startet, erscheint sie hier.'}</p>
    </section>}

    <section className="list-card activity-card">
      <div className="section-heading"><div><span className="section-kicker">Gemeinsam dranbleiben</span><h2>{group.name} Aktivität</h2></div><span>{feed.length ? 'Live' : 'Noch ruhig'}</span></div>
      {feed.length === 0 ? <div className="empty-feed"><Dumbbell size={24}/><p>Nach euren ersten Trainings erscheinen hier PRs, Home-Workouts und Challenges.</p></div> : feed.map(item => <div className="activity-row" key={item.id}>
        {item.avatarUrl ? <img src={item.avatarUrl} alt="" className="activity-avatar"/> : <div className={`activity-icon ${item.type === 'PERSONAL_RECORD' ? 'pr' : item.type === 'HOME_WORKOUT_COMPLETED' ? 'home' : item.type === 'CHALLENGE_COMPLETED' ? 'challenge' : ''}`}>
          {item.type === 'PERSONAL_RECORD' ? <Trophy size={17}/> : item.type === 'HOME_WORKOUT_COMPLETED' ? <Home size={17}/> : item.type === 'CHALLENGE_COMPLETED' ? <Flame size={17}/> : <Dumbbell size={17}/>}
        </div>}
        <div className="activity-copy"><strong>{item.title}</strong><small>{item.detail} · {when(item.createdAt)}</small></div>
        <ChevronRight size={16}/>
      </div>)}
    </section>
  </>
}
