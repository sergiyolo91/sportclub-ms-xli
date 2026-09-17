'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, Dumbbell, Home, Plus, X } from 'lucide-react'

type Exercise = { id: string; name: string; category: string; measurement_type: 'WEIGHT_REPS' | 'REPS' | 'TIME' | string }

type SavedSet = {
  id: string
  exerciseId: string
  exerciseName: string
  setNumber: number
  weight?: number | null
  reps?: number | null
  duration?: number | null
}

export default function TrainingPanel({ userId, groupId, exercises }: { userId: string; groupId: string; exercises: Exercise[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [workoutId, setWorkoutId] = useState<string | null>(null)
  const [workoutType, setWorkoutType] = useState<'REGULAR' | 'HOME'>('REGULAR')
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? '')
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [duration, setDuration] = useState('')
  const [sets, setSets] = useState<SavedSet[]>([])
  const [weIds, setWeIds] = useState<Record<string,string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const exercise = exercises.find(e => e.id === exerciseId)

  async function begin(type: 'REGULAR' | 'HOME') {
    setBusy(true)
    setMessage('')
    const title = type === 'HOME' ? 'Zuhause' : 'Freies Training'
    const { data, error } = await supabase.from('workouts').insert({
      user_id: userId,
      group_id: groupId,
      title,
      workout_type: type,
      visibility: 'GROUP',
    }).select('id').single()
    if (error) setMessage(error.message)
    else {
      setWorkoutId(data.id)
      setWorkoutType(type)
      setOpen(true)
    }
    setBusy(false)
  }

  async function ensureWorkoutExercise() {
    if (!workoutId || !exerciseId) return null
    if (weIds[exerciseId]) return weIds[exerciseId]
    const position = Object.keys(weIds).length
    const { data, error } = await supabase.from('workout_exercises').insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      position,
    }).select('id').single()
    if (error) throw error
    setWeIds(prev => ({ ...prev, [exerciseId]: data.id }))
    return data.id as string
  }

  async function saveSet() {
    if (!exercise || !workoutId) return
    setBusy(true)
    setMessage('')
    try {
      const workoutExerciseId = await ensureWorkoutExercise()
      if (!workoutExerciseId) return
      const setNumber = sets.filter(s => s.exerciseId === exerciseId).length + 1
      const payload: any = { workout_exercise_id: workoutExerciseId, set_number: setNumber }
      if (exercise.measurement_type === 'TIME') payload.duration_seconds = Number(duration || 0)
      else if (exercise.measurement_type === 'REPS') payload.repetitions = Number(reps || 0)
      else {
        payload.weight_kg = Number(weight || 0)
        payload.repetitions = Number(reps || 0)
      }
      const { data, error } = await supabase.from('workout_sets').insert(payload).select('id').single()
      if (error) throw error
      setSets(prev => [...prev, {
        id: data.id,
        exerciseId,
        exerciseName: exercise.name,
        setNumber,
        weight: payload.weight_kg ?? null,
        reps: payload.repetitions ?? null,
        duration: payload.duration_seconds ?? null,
      }])
      if (exercise.measurement_type === 'TIME') setDuration('')
    } catch (err: any) {
      setMessage(err.message || 'Satz konnte nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    if (!workoutId) return
    setBusy(true)
    const { error } = await supabase.rpc('finish_workout', { p_workout_id: workoutId })
    if (error) {
      setMessage(error.message)
      setBusy(false)
      return
    }
    setOpen(false)
    setWorkoutId(null)
    setSets([])
    setWeIds({})
    setWeight('')
    setReps('')
    setDuration('')
    setMessage('Training gespeichert. Stark.')
    setBusy(false)
  }

  if (!open) {
    return <div className="training-actions">
      <button className="primary-btn" onClick={() => begin('REGULAR')} disabled={busy}><Dumbbell size={18}/> Freies Training</button>
      <button className="secondary-btn" onClick={() => begin('HOME')} disabled={busy}><Home size={18}/> Zuhause trainieren</button>
      {message && <p className="notice">{message}</p>}
    </div>
  }

  return <div className="training-overlay">
    <section className="training-sheet">
      <header className="training-head">
        <div><div className="eyebrow">{workoutType === 'HOME' ? 'Home-Workout' : 'Training läuft'}</div><h2>Satz eintragen</h2></div>
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Schließen"><X size={20}/></button>
      </header>

      <label className="field-label">Übung</label>
      <select className="select-input" value={exerciseId} onChange={e => setExerciseId(e.target.value)}>
        {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name} · {ex.category}</option>)}
      </select>

      {exercise?.measurement_type === 'TIME' ? <>
        <label className="field-label">Dauer in Sekunden</label>
        <input inputMode="numeric" value={duration} onChange={e => setDuration(e.target.value)} placeholder="z. B. 60" />
      </> : <div className="input-grid">
        {exercise?.measurement_type !== 'REPS' && <div><label className="field-label">Gewicht (kg)</label><input inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value.replace(',','.'))} placeholder="82.5" /></div>}
        <div><label className="field-label">Wiederholungen</label><input inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)} placeholder="10" /></div>
      </div>}

      <button className="save-set-btn" onClick={saveSet} disabled={busy || !exerciseId}><Plus size={18}/> Satz speichern</button>

      <div className="saved-sets">
        {sets.length === 0 ? <p className="muted">Noch kein Satz gespeichert.</p> : sets.slice().reverse().map(s => <div className="saved-set" key={s.id}>
          <div><strong>{s.exerciseName}</strong><small>Satz {s.setNumber}</small></div>
          <span>{s.duration ? `${s.duration}s` : s.weight != null ? `${s.weight} kg × ${s.reps}` : `${s.reps} Wdh.`}</span>
        </div>)}
      </div>

      {message && <p className="notice">{message}</p>}
      <button className="finish-btn" onClick={finish} disabled={busy || sets.length === 0}><Check size={18}/> Training abschließen</button>
    </section>
  </div>
}
