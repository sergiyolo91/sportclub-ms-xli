'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, ChevronLeft, ChevronRight, Dumbbell, Home, Plus, Trophy, X } from 'lucide-react'
import styles from './features.module.css'

type Exercise = { id: string; name: string; category: string; measurement_type: 'WEIGHT_REPS' | 'REPS' | 'TIME' | string }
type TemplateDay = { id: string; name: string; workout_type: 'REGULAR' | 'HOME' | 'FREE'; exercises: Exercise[] }
type SavedSet = { id: string; exerciseId: string; exerciseName: string; setNumber: number; weight?: number | null; reps?: number | null; duration?: number | null }
type ReferenceSet = { weight_kg: number | null; repetitions: number | null; duration_seconds: number | null; estimated_1rm: number | null; completed_at: string }

export default function TrainingPanel({ userId, groupId, exercises }: { userId: string; groupId: string; exercises: Exercise[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [templates, setTemplates] = useState<TemplateDay[]>([])
  const [open, setOpen] = useState(false)
  const [workoutId, setWorkoutId] = useState<string | null>(null)
  const [workoutType, setWorkoutType] = useState<'REGULAR' | 'HOME'>('REGULAR')
  const [activeTemplate, setActiveTemplate] = useState<TemplateDay | null>(null)
  const [templateIndex, setTemplateIndex] = useState(0)
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? '')
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [duration, setDuration] = useState('')
  const [sets, setSets] = useState<SavedSet[]>([])
  const [weIds, setWeIds] = useState<Record<string,string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [lastSet, setLastSet] = useState<ReferenceSet | null>(null)
  const [best1rm, setBest1rm] = useState<number | null>(null)

  const exercise = exercises.find(e => e.id === exerciseId)

  useEffect(() => { void loadTemplates() }, [groupId])
  useEffect(() => {
    if (!exerciseId) return
    void loadReferenceValues()
  }, [exerciseId, userId])

  async function loadTemplates() {
    const { data } = await supabase
      .from('workout_templates')
      .select('id,name,workout_type,workout_template_exercises(position,exercises(id,name,category,measurement_type))')
      .eq('group_id', groupId)
      .eq('visibility', 'GROUP')
      .order('name')

    const normalized: TemplateDay[] = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      workout_type: row.workout_type,
      exercises: (row.workout_template_exercises || [])
        .slice()
        .sort((a: any, b: any) => a.position - b.position)
        .map((item: any) => Array.isArray(item.exercises) ? item.exercises[0] : item.exercises)
        .filter(Boolean),
    }))
    setTemplates(normalized)
  }

  async function loadReferenceValues() {
    setWeight('')
    setReps('')
    setDuration('')
    const [{ data: latest }, { data: best }] = await Promise.all([
      supabase.from('workout_set_details')
        .select('weight_kg,repetitions,duration_seconds,estimated_1rm,completed_at')
        .eq('user_id', userId).eq('exercise_id', exerciseId)
        .order('completed_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('workout_set_details')
        .select('estimated_1rm').eq('user_id', userId).eq('exercise_id', exerciseId)
        .not('estimated_1rm', 'is', null).order('estimated_1rm', { ascending: false }).limit(1).maybeSingle(),
    ])

    const ref = latest ? {
      weight_kg: latest.weight_kg == null ? null : Number(latest.weight_kg),
      repetitions: latest.repetitions,
      duration_seconds: latest.duration_seconds,
      estimated_1rm: latest.estimated_1rm == null ? null : Number(latest.estimated_1rm),
      completed_at: latest.completed_at,
    } : null

    setLastSet(ref)
    setBest1rm(best?.estimated_1rm == null ? null : Number(best.estimated_1rm))
    if (ref && !sets.some(s => s.exerciseId === exerciseId)) {
      if (ref.weight_kg != null) setWeight(String(ref.weight_kg))
      if (ref.repetitions != null) setReps(String(ref.repetitions))
      if (ref.duration_seconds != null) setDuration(String(ref.duration_seconds))
    }
  }

  async function begin(type: 'REGULAR' | 'HOME') {
    setBusy(true); setMessage('')
    const title = type === 'HOME' ? 'Zuhause' : 'Freies Training'
    const { data, error } = await supabase.from('workouts').insert({ user_id: userId, group_id: groupId, title, workout_type: type, visibility: 'GROUP' }).select('id').single()
    if (error) setMessage(error.message)
    else {
      setWorkoutId(data.id); setWorkoutType(type); setActiveTemplate(null); setTemplateIndex(0); setOpen(true)
      if (exercises[0]) setExerciseId(exercises[0].id)
    }
    setBusy(false)
  }

  async function beginTemplate(template: TemplateDay) {
    if (!template.exercises.length) return
    setBusy(true); setMessage('')
    const { data: workout, error } = await supabase.from('workouts').insert({
      user_id: userId, group_id: groupId, template_id: template.id, title: template.name,
      workout_type: template.workout_type === 'HOME' ? 'HOME' : 'REGULAR', visibility: 'GROUP',
    }).select('id').single()
    if (error || !workout) { setMessage(error?.message || 'Training konnte nicht gestartet werden.'); setBusy(false); return }

    const { data: exerciseRows, error: exerciseError } = await supabase.from('workout_exercises').insert(
      template.exercises.map((ex, position) => ({ workout_id: workout.id, exercise_id: ex.id, position }))
    ).select('id,exercise_id')

    if (exerciseError) {
      await supabase.from('workouts').delete().eq('id', workout.id)
      setMessage(exerciseError.message); setBusy(false); return
    }

    const ids: Record<string,string> = {}
    for (const row of (exerciseRows || []) as any[]) ids[row.exercise_id] = row.id
    setWeIds(ids); setWorkoutId(workout.id); setWorkoutType(template.workout_type === 'HOME' ? 'HOME' : 'REGULAR')
    setActiveTemplate(template); setTemplateIndex(0); setExerciseId(template.exercises[0].id); setOpen(true); setBusy(false)
  }

  async function ensureWorkoutExercise() {
    if (!workoutId || !exerciseId) return null
    if (weIds[exerciseId]) return weIds[exerciseId]
    const { data, error } = await supabase.from('workout_exercises').insert({ workout_id: workoutId, exercise_id: exerciseId, position: Object.keys(weIds).length }).select('id').single()
    if (error) throw error
    setWeIds(prev => ({ ...prev, [exerciseId]: data.id }))
    return data.id as string
  }

  async function saveSet() {
    if (!exercise || !workoutId) return
    setBusy(true); setMessage('')
    try {
      const workoutExerciseId = await ensureWorkoutExercise()
      if (!workoutExerciseId) return
      const setNumber = sets.filter(s => s.exerciseId === exerciseId).length + 1
      const payload: any = { workout_exercise_id: workoutExerciseId, set_number: setNumber }
      if (exercise.measurement_type === 'TIME') payload.duration_seconds = Number(duration || 0)
      else if (exercise.measurement_type === 'REPS') payload.repetitions = Number(reps || 0)
      else { payload.weight_kg = Number(weight || 0); payload.repetitions = Number(reps || 0) }
      const { data, error } = await supabase.from('workout_sets').insert(payload).select('id,estimated_1rm').single()
      if (error) throw error
      setSets(prev => [...prev, { id: data.id, exerciseId, exerciseName: exercise.name, setNumber, weight: payload.weight_kg ?? null, reps: payload.repetitions ?? null, duration: payload.duration_seconds ?? null }])
      if (data.estimated_1rm != null) {
        const current = Number(data.estimated_1rm)
        if (best1rm == null || current > best1rm) { setBest1rm(current); setMessage(`Neuer persönlicher Bestwert: ${current.toFixed(1)} kg geschätztes 1RM.`) }
      }
    } catch (err: any) { setMessage(err.message || 'Satz konnte nicht gespeichert werden.') }
    finally { setBusy(false) }
  }

  function goTemplate(index: number) {
    if (!activeTemplate) return
    const next = Math.max(0, Math.min(activeTemplate.exercises.length - 1, index))
    setTemplateIndex(next); setExerciseId(activeTemplate.exercises[next].id); setMessage('')
  }

  async function cancelWorkout() {
    if (!workoutId) { setOpen(false); return }
    if (!window.confirm('Training wirklich abbrechen? Die bisher eingetragenen Sätze dieses Trainings werden gelöscht.')) return
    await supabase.from('workouts').delete().eq('id', workoutId)
    resetWorkout('')
  }

  async function finish() {
    if (!workoutId) return
    setBusy(true)
    const { error } = await supabase.rpc('finish_workout', { p_workout_id: workoutId })
    if (error) { setMessage(error.message); setBusy(false); return }
    resetWorkout('Training gespeichert. Stark.')
    setBusy(false)
  }

  function resetWorkout(doneMessage: string) {
    setOpen(false); setWorkoutId(null); setSets([]); setWeIds({}); setWeight(''); setReps(''); setDuration('')
    setActiveTemplate(null); setTemplateIndex(0); setMessage(doneMessage)
  }

  function lastPerformanceText() {
    if (!lastSet) return 'Noch keine vorherige Leistung'
    if (exercise?.measurement_type === 'TIME') return `${lastSet.duration_seconds ?? 0} Sek.`
    if (exercise?.measurement_type === 'REPS') return `${lastSet.repetitions ?? 0} Wdh.`
    return `${lastSet.weight_kg ?? 0} kg × ${lastSet.repetitions ?? 0}`
  }

  if (!open) return <div className={styles.trainingStart}>
    {templates.length > 0 && <div className={styles.templateBlock}>
      <div className="eyebrow">Gruppentrainingstage</div>
      <div className={styles.templateList}>
        {templates.map(template => <button key={template.id} className={styles.templateCard} onClick={() => beginTemplate(template)} disabled={busy}>
          <span><strong>{template.name}</strong><small>{template.exercises.length} Übungen · {template.exercises.slice(0,3).map(e => e.name).join(' · ')}{template.exercises.length > 3 ? ' …' : ''}</small></span>
          <ChevronRight size={19}/>
        </button>)}
      </div>
    </div>}
    <div className={styles.freeActions}>
      <button className="primary-btn" onClick={() => begin('REGULAR')} disabled={busy}><Dumbbell size={18}/> Freies Training</button>
      <button className="secondary-btn" onClick={() => begin('HOME')} disabled={busy}><Home size={18}/> Zuhause trainieren</button>
    </div>
    {message && <p className="notice">{message}</p>}
  </div>

  return <div className="training-overlay">
    <section className="training-sheet">
      <header className="training-head">
        <div>
          <div className="eyebrow">{activeTemplate ? activeTemplate.name : workoutType === 'HOME' ? 'Home-Workout' : 'Training läuft'}</div>
          <h2>{activeTemplate ? `Übung ${templateIndex + 1} von ${activeTemplate.exercises.length}` : 'Satz eintragen'}</h2>
        </div>
        <button className="icon-btn" onClick={cancelWorkout} aria-label="Training abbrechen"><X size={20}/></button>
      </header>

      {activeTemplate ? <div className={styles.exerciseHeadline}><strong>{exercise?.name}</strong><span>{exercise?.category}</span></div> : <>
        <label className="field-label">Übung</label>
        <select className="select-input" value={exerciseId} onChange={e => setExerciseId(e.target.value)}>
          {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name} · {ex.category}</option>)}
        </select>
      </>}

      <div className={styles.referenceGrid}>
        <div className={styles.referenceCard}><div className="eyebrow">Letztes Mal</div><strong>{lastPerformanceText()}</strong></div>
        <div className={styles.recordCard}><div className="eyebrow">Persönlicher Rekord</div><strong><Trophy size={15}/>{best1rm == null ? '–' : `${best1rm.toFixed(1)} kg`}</strong></div>
      </div>

      {exercise?.measurement_type === 'TIME' ? <>
        <label className="field-label">Dauer in Sekunden</label>
        <input inputMode="numeric" value={duration} onChange={e => setDuration(e.target.value)} placeholder="z. B. 60" />
      </> : <div className="input-grid">
        {exercise?.measurement_type !== 'REPS' && <div><label className="field-label">Gewicht (kg)</label><input inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value.replace(',','.'))} placeholder="82.5" /></div>}
        <div><label className="field-label">Wiederholungen</label><input inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)} placeholder="10" /></div>
      </div>}

      <button className="save-set-btn" onClick={saveSet} disabled={busy || !exerciseId}><Plus size={18}/> Satz speichern</button>

      <div className="saved-sets">
        {sets.filter(s => s.exerciseId === exerciseId).length === 0 ? <p className="muted">Für diese Übung noch kein Satz gespeichert.</p> : sets.filter(s => s.exerciseId === exerciseId).slice().reverse().map(s => <div className="saved-set" key={s.id}>
          <div><strong>{s.exerciseName}</strong><small>Satz {s.setNumber}</small></div>
          <span>{s.duration ? `${s.duration}s` : s.weight != null ? `${s.weight} kg × ${s.reps}` : `${s.reps} Wdh.`}</span>
        </div>)}
      </div>

      {activeTemplate && <div className={styles.exerciseNav}>
        <button onClick={() => goTemplate(templateIndex - 1)} disabled={templateIndex === 0}><ChevronLeft size={17}/> Zurück</button>
        <button onClick={() => goTemplate(templateIndex + 1)} disabled={templateIndex === activeTemplate.exercises.length - 1}>Nächste Übung <ChevronRight size={17}/></button>
      </div>}

      {message && <p className="notice">{message}</p>}
      <button className="finish-btn" onClick={finish} disabled={busy || sets.length === 0}><Check size={18}/> Training abschließen</button>
    </section>
  </div>
}
