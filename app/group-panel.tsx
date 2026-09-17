'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Camera, Copy, Dumbbell, Flame, LogOut, Plus, Scale, Users } from 'lucide-react'
import styles from './features.module.css'

type Group = { id: string; name: string; invite_code: string; role: 'ADMIN' | 'MEMBER' }
type Member = { user_id: string; role: 'ADMIN' | 'MEMBER'; display_name: string; avatar_path: string | null; avatar_url: string | null }
type Exercise = { id: string; name: string; category: string; measurement_type: string }
type GroupTemplate = { id: string; name: string; exercises: string[] }

export default function GroupPanel({ userId, group, onLogout }: { userId: string; group: Group; onLogout: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [profileName, setProfileName] = useState('')
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [weight, setWeight] = useState('')
  const [latestWeight, setLatestWeight] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [showChallenge, setShowChallenge] = useState(false)
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [target, setTarget] = useState('1')
  const [days, setDays] = useState('7')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [templates, setTemplates] = useState<GroupTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [selectedExercises, setSelectedExercises] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const signedAvatar = useCallback(async (path: string | null) => {
    if (!path) return null
    const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60)
    return data?.signedUrl ?? null
  }, [supabase])

  const loadProfile = useCallback(async () => {
    const [{ data: profile }, { data: weightRow }] = await Promise.all([
      supabase.from('profiles').select('display_name,avatar_url').eq('id', userId).maybeSingle(),
      supabase.from('body_weights').select('weight_kg').eq('user_id', userId).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const path = profile?.avatar_url || null
    setProfileName(profile?.display_name || 'Sportler')
    setAvatarPath(path)
    setAvatarUrl(await signedAvatar(path))
    setLatestWeight(weightRow?.weight_kg == null ? null : Number(weightRow.weight_kg))
  }, [signedAvatar, supabase, userId])

  const loadMembers = useCallback(async () => {
    const { data: membershipRows } = await supabase.from('group_members').select('user_id,role').eq('group_id', group.id).order('joined_at')
    const ids = (membershipRows || []).map((m: any) => m.user_id)
    const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,display_name,avatar_url').in('id', ids) : { data: [] as any[] }
    const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]))
    const base = (membershipRows || []).map((m: any) => {
      const p = profileMap.get(m.user_id)
      return { user_id: m.user_id, role: m.role, display_name: p?.display_name || 'Mitglied', avatar_path: p?.avatar_url || null, avatar_url: null } as Member
    })
    const withUrls = await Promise.all(base.map(async member => ({ ...member, avatar_url: await signedAvatar(member.avatar_path) })))
    setMembers(withUrls)
  }, [group.id, signedAvatar, supabase])

  const loadTemplates = useCallback(async () => {
    const [{ data: exerciseRows }, { data: templateRows }] = await Promise.all([
      supabase.from('exercises').select('id,name,category,measurement_type').eq('is_active', true).order('category').order('name'),
      supabase.from('workout_templates').select('id,name,workout_template_exercises(position,exercises(name))').eq('group_id', group.id).eq('visibility', 'GROUP').order('name'),
    ])
    setExercises((exerciseRows || []) as Exercise[])
    setTemplates((templateRows || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      exercises: (row.workout_template_exercises || []).slice().sort((a: any,b: any) => a.position-b.position).map((item: any) => {
        const ex = Array.isArray(item.exercises) ? item.exercises[0] : item.exercises
        return ex?.name || 'Übung'
      }),
    })))
  }, [group.id, supabase])

  useEffect(() => { void Promise.all([loadProfile(), loadMembers(), loadTemplates()]) }, [loadProfile, loadMembers, loadTemplates])

  async function copyCode() {
    await navigator.clipboard.writeText(group.invite_code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  async function uploadAvatar(file?: File) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setMessage('Das Profilbild darf maximal 5 MB groß sein.'); return }
    if (file.type && !file.type.startsWith('image/')) { setMessage('Bitte wähle ein Bild aus.'); return }
    setBusy(true); setMessage('')
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${userId}/profile-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { cacheControl: '3600', contentType: file.type || undefined })
    if (uploadError) { setMessage(uploadError.message); setBusy(false); return }
    const { error: profileError } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId)
    if (profileError) { await supabase.storage.from('avatars').remove([path]); setMessage(profileError.message); setBusy(false); return }
    if (avatarPath && avatarPath !== path) await supabase.storage.from('avatars').remove([avatarPath])
    setMessage('Profilbild gespeichert.')
    await Promise.all([loadProfile(), loadMembers()])
    setBusy(false)
  }

  async function saveWeight() {
    const value = Number(weight.replace(',','.'))
    if (!value || value <= 0) return
    setBusy(true); setMessage('')
    const { error } = await supabase.from('body_weights').insert({ user_id: userId, weight_kg: value })
    if (error) setMessage(error.message)
    else { setWeight(''); setLatestWeight(value); setMessage('Körpergewicht gespeichert. Es bleibt für die anderen Mitglieder verborgen.') }
    setBusy(false)
  }

  async function createChallenge() {
    if (!title.trim()) return
    setBusy(true); setMessage('')
    const end = new Date(); end.setDate(end.getDate() + Math.max(1, Number(days) || 7))
    const { error } = await supabase.from('challenges').insert({
      group_id: group.id, title: title.trim(), description: description.trim() || null,
      target_count: Math.max(1, Number(target) || 1), starts_at: new Date().toISOString(), ends_at: end.toISOString(), created_by: userId,
    })
    if (error) setMessage(error.message)
    else { setMessage('Challenge ist aktiv und erscheint jetzt bei allen auf der Heute-Seite.'); setTitle(''); setDescription(''); setTarget('1'); setShowChallenge(false) }
    setBusy(false)
  }

  function toggleExercise(id: string) {
    setSelectedExercises(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function createTemplate() {
    if (!templateName.trim() || selectedExercises.length === 0) return
    setBusy(true); setMessage('')
    const { data: template, error } = await supabase.from('workout_templates').insert({
      user_id: userId, group_id: group.id, name: templateName.trim(), workout_type: 'REGULAR', visibility: 'GROUP',
    }).select('id').single()
    if (error || !template) { setMessage(error?.message || 'Trainingstag konnte nicht angelegt werden.'); setBusy(false); return }
    const { error: exerciseError } = await supabase.from('workout_template_exercises').insert(
      selectedExercises.map((exercise_id, position) => ({ template_id: template.id, exercise_id, position }))
    )
    if (exerciseError) {
      await supabase.from('workout_templates').delete().eq('id', template.id)
      setMessage(exerciseError.message); setBusy(false); return
    }
    setTemplateName(''); setSelectedExercises([]); setShowTemplateBuilder(false)
    setMessage('Trainingstag gespeichert. Er kann ab jetzt von allen auf der Heute-Seite gestartet werden.')
    await loadTemplates(); setBusy(false)
  }

  const categories = [...new Set(exercises.map(e => e.category))]
  const selectedNames = selectedExercises.map(id => exercises.find(e => e.id === id)?.name).filter(Boolean)

  return <section className="screen-pad">
    <div className="eyebrow">Deine Gruppe</div>
    <h2 className="screen-title">{group.name}</h2>

    <div className={styles.profileCard}>
      <div className={styles.avatarWrap}>
        {avatarUrl ? <img src={avatarUrl} alt="Profilbild" className={styles.avatarLarge}/> : <div className={styles.avatarFallback}>{profileName.slice(0,1).toUpperCase()}</div>}
      </div>
      <div className={styles.profileMeta}>
        <strong>{profileName}</strong>
        <small>{group.role === 'ADMIN' ? 'Admin' : 'Mitglied'} · {latestWeight ? `${latestWeight.toFixed(1)} kg hinterlegt` : 'noch kein Gewicht hinterlegt'}</small>
        <button className={styles.avatarButton} onClick={() => fileRef.current?.click()} disabled={busy}><Camera size={15}/> Profilbild {avatarPath ? 'ändern' : 'einstellen'}</button>
        <input ref={fileRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={e => void uploadAvatar(e.target.files?.[0])}/>
        <div className={styles.photoHint}>Das Bild wird nur für eure App-Profile verwendet.</div>
      </div>
    </div>

    <div className={styles.sectionCard}>
      <div className={styles.sectionHead}><h3><Scale size={17}/> Körpergewicht</h3><span>privat</span></div>
      <p className="muted">Wird für deine relative Rangliste verwendet, aber nicht als kg-Wert für andere angezeigt.</p>
      <div className={styles.weightRow}><input inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder={latestWeight ? `Aktuell ${latestWeight.toFixed(1)} kg` : 'z. B. 82,5 kg'}/><button onClick={saveWeight} disabled={busy}>Speichern</button></div>
    </div>

    <div className="group-code">
      <span>Einladungscode</span><strong>{group.invite_code}</strong><small>{members.length} {members.length === 1 ? 'Mitglied' : 'Mitglieder'}</small>
      <button className={styles.avatarButton} onClick={copyCode}><Copy size={15}/>{copied ? 'Kopiert' : 'Code kopieren'}</button>
    </div>

    <div className={styles.sectionCard}>
      <div className={styles.sectionHead}><h3><Dumbbell size={17}/> Trainingstage</h3><span>{templates.length}</span></div>
      {templates.length === 0 ? <p className="muted">Noch keine festen Trainingstage angelegt.</p> : templates.map(template => <div className={styles.templateSummary} key={template.id}><strong>{template.name}</strong><small>{template.exercises.join(' · ')}</small></div>)}
      {group.role === 'ADMIN' && <>
        <button className={styles.adminToggle} onClick={() => setShowTemplateBuilder(v => !v)}><Plus size={17}/>{showTemplateBuilder ? 'Eingabe schließen' : 'Trainingstag anlegen'}</button>
        {showTemplateBuilder && <div className={styles.builder}>
          <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="z. B. Rücken & Schultern" />
          {selectedNames.length > 0 && <p className="muted"><strong>Reihenfolge:</strong> {selectedNames.map((name, i) => `${i+1}. ${name}`).join(' · ')}</p>}
          <div className={styles.exercisePicker}>
            {categories.map(category => <div className={styles.pickerGroup} key={category}><strong>{category}</strong><div className={styles.pickerOptions}>
              {exercises.filter(e => e.category === category).map(ex => <button type="button" key={ex.id} className={`${styles.pickerButton} ${selectedExercises.includes(ex.id) ? styles.selected : ''}`} onClick={() => toggleExercise(ex.id)}>{selectedExercises.includes(ex.id) ? `${selectedExercises.indexOf(ex.id)+1}. ` : ''}{ex.name}</button>)}
            </div></div>)}
          </div>
          <div className={styles.builderFooter}><button className="primary-btn" onClick={createTemplate} disabled={busy || !templateName.trim() || selectedExercises.length === 0}><Plus size={17}/> Für die Gruppe speichern</button></div>
        </div>}
      </>}
    </div>

    {group.role === 'ADMIN' && <>
      <button className={styles.adminToggle} onClick={() => setShowChallenge(v => !v)}><Flame size={18}/>{showChallenge ? 'Challenge schließen' : 'Neue Challenge'}</button>
      {showChallenge && <div className={styles.builder}>
        <div className="eyebrow">Wochenchallenge anlegen</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. 3 × 50 Liegestütze" />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Kurze Beschreibung (optional)" />
        <div className={styles.weightRow}><input inputMode="numeric" value={target} onChange={e => setTarget(e.target.value)} placeholder="Zielwert"/><input inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} placeholder="Tage"/></div>
        <button className="primary-btn" onClick={createChallenge} disabled={busy || !title.trim()}><Plus size={17}/>{busy ? 'Wird angelegt …' : 'Challenge starten'}</button>
      </div>}
    </>}

    {message && <p className="notice">{message}</p>}

    <div className="list-card">
      <div className="section-heading"><h2>Mitglieder</h2><span>{members.length}</span></div>
      {members.map(member => <div className="row" key={member.user_id}>
        <div><strong>{member.display_name}</strong><small>{member.role === 'ADMIN' ? 'Admin' : 'Mitglied'}</small></div>
        <div className={styles.memberAvatar}>{member.avatar_url ? <img src={member.avatar_url} alt="" className={styles.avatarSmall}/> : <div className={styles.avatarMiniFallback}>{member.display_name.slice(0,1).toUpperCase()}</div>}</div>
      </div>)}
      {!members.length && <div className="empty-feed"><Users size={24}/><p>Noch keine Mitglieder gefunden.</p></div>}
    </div>

    <button className="logout-btn" onClick={onLogout}><LogOut size={18}/> Abmelden</button>
  </section>
}
