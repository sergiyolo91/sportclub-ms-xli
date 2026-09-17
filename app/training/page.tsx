'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Check, Dumbbell, Plus } from 'lucide-react'

type Exercise = { id:string; name:string; category:string; measurement_type:'WEIGHT_REPS'|'REPS'|'TIME' }
type SavedSet = { id:string; set_number:number; weight_kg:number|null; repetitions:number|null; duration_seconds:number|null; exercise_name:string }

export default function TrainingPage(){
  const supabase = useMemo(()=>createClient(),[])
  const [user,setUser]=useState<any>(null)
  const [groupId,setGroupId]=useState<string|null>(null)
  const [exercises,setExercises]=useState<Exercise[]>([])
  const [workoutId,setWorkoutId]=useState<string|null>(null)
  const [startedAt,setStartedAt]=useState<Date|null>(null)
  const [type,setType]=useState<'REGULAR'|'HOME'|'FREE'>('REGULAR')
  const [title,setTitle]=useState('Freies Training')
  const [exerciseId,setExerciseId]=useState('')
  const [weight,setWeight]=useState('')
  const [reps,setReps]=useState('')
  const [seconds,setSeconds]=useState('')
  const [sets,setSets]=useState<SavedSet[]>([])
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  useEffect(()=>{ void init() },[])

  async function init(){
    const {data:{session}}=await supabase.auth.getSession()
    if(!session){ window.location.href='/'; return }
    setUser(session.user)
    const [{data:membership},{data:exerciseRows}]=await Promise.all([
      supabase.from('group_members').select('group_id').eq('user_id',session.user.id).limit(1).maybeSingle(),
      supabase.from('exercises').select('id,name,category,measurement_type').eq('is_active',true).order('category').order('name')
    ])
    setGroupId(membership?.group_id ?? null)
    setExercises((exerciseRows as Exercise[])||[])
    if(exerciseRows?.[0]) setExerciseId(exerciseRows[0].id)
  }

  async function startWorkout(){
    if(!user) return
    setBusy(true); setMessage('')
    const now=new Date()
    const {data,error}=await supabase.from('workouts').insert({
      user_id:user.id, group_id:groupId, title:title.trim()||'Training', workout_type:type, visibility:'GROUP', started_at:now.toISOString()
    }).select('id').single()
    if(error){setMessage(error.message);setBusy(false);return}
    setWorkoutId(data.id);setStartedAt(now);setBusy(false)
  }

  async function saveSet(){
    if(!workoutId||!exerciseId) return
    const exercise=exercises.find(e=>e.id===exerciseId)
    if(!exercise) return
    setBusy(true);setMessage('')

    let workoutExerciseId:string|null=null
    const {data:existing}=await supabase.from('workout_exercises').select('id').eq('workout_id',workoutId).eq('exercise_id',exerciseId).maybeSingle()
    workoutExerciseId=existing?.id ?? null
    if(!workoutExerciseId){
      const {data:created,error}=await supabase.from('workout_exercises').insert({workout_id:workoutId,exercise_id:exerciseId,position:new Set(sets.map(s=>s.exercise_name)).size}).select('id').single()
      if(error){setMessage(error.message);setBusy(false);return}
      workoutExerciseId=created.id
    }

    const nextNumber=sets.filter(s=>s.exercise_name===exercise.name).length+1
    const payload:any={workout_exercise_id:workoutExerciseId,set_number:nextNumber}
    if(exercise.measurement_type==='WEIGHT_REPS'){payload.weight_kg=Number(weight.replace(',','.'));payload.repetitions=Number(reps)}
    if(exercise.measurement_type==='REPS'){payload.repetitions=Number(reps)}
    if(exercise.measurement_type==='TIME'){payload.duration_seconds=Number(seconds)}
    const {data,error}=await supabase.from('workout_sets').insert(payload).select('id,set_number,weight_kg,repetitions,duration_seconds').single()
    if(error){setMessage(error.message);setBusy(false);return}
    setSets(prev=>[...prev,{...data,exercise_name:exercise.name}])
    setBusy(false)
  }

  async function finishWorkout(){
    if(!workoutId||!user) return
    setBusy(true)
    const now=new Date()
    const duration=startedAt?Math.max(0,Math.round((now.getTime()-startedAt.getTime())/1000)):null
    const {error}=await supabase.from('workouts').update({finished_at:now.toISOString(),duration_seconds:duration}).eq('id',workoutId)
    if(!error&&groupId){
      await supabase.from('activities').insert({group_id:groupId,user_id:user.id,workout_id:workoutId,activity_type:type==='HOME'?'HOME_WORKOUT_COMPLETED':'WORKOUT_COMPLETED'})
    }
    setBusy(false)
    if(error) setMessage(error.message); else window.location.href='/'
  }

  const currentExercise=exercises.find(e=>e.id===exerciseId)

  return <main className="shell training-shell">
    <header className="training-header"><a className="back-link" href="/"><ArrowLeft size={20}/></a><div><div className="eyebrow">Training</div><h1>{workoutId?title:'Neue Einheit'}</h1></div></header>

    {!workoutId ? <section className="hero-card training-setup">
      <div className="eyebrow">Einheit starten</div>
      <h2>Was trainierst du heute?</h2>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Name der Einheit"/>
      <div className="type-grid">
        {([['REGULAR','Normal'],['HOME','Zuhause'],['FREE','Frei']] as const).map(([value,label])=><button key={value} className={type===value?'type-btn active':'type-btn'} onClick={()=>{setType(value);if(value==='HOME'&&title==='Freies Training')setTitle('Zuhause Training')}}>{label}</button>)}
      </div>
      <button className="primary-btn" onClick={startWorkout} disabled={busy}><Dumbbell size={18}/> Training starten</button>
    </section> : <>
      <section className="exercise-entry">
        <label>Übung</label>
        <select value={exerciseId} onChange={e=>setExerciseId(e.target.value)}>{exercises.map(ex=><option key={ex.id} value={ex.id}>{ex.name} · {ex.category}</option>)}</select>
        {currentExercise?.measurement_type==='WEIGHT_REPS'&&<div className="input-pair"><div><label>Gewicht</label><input inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="82,5"/><span>kg</span></div><div><label>Wiederholungen</label><input inputMode="numeric" value={reps} onChange={e=>setReps(e.target.value)} placeholder="10"/></div></div>}
        {currentExercise?.measurement_type==='REPS'&&<div><label>Wiederholungen</label><input inputMode="numeric" value={reps} onChange={e=>setReps(e.target.value)} placeholder="20"/></div>}
        {currentExercise?.measurement_type==='TIME'&&<div><label>Zeit in Sekunden</label><input inputMode="numeric" value={seconds} onChange={e=>setSeconds(e.target.value)} placeholder="60"/></div>}
        <button className="primary-btn" onClick={saveSet} disabled={busy}><Plus size={18}/> Satz speichern</button>
      </section>

      <section className="list-card set-list">
        <div className="section-heading"><h2>Heute</h2><span>{sets.length} Sätze</span></div>
        {sets.length===0&&<p className="empty-copy">Noch kein Satz gespeichert.</p>}
        {sets.map(set=><div className="saved-set" key={set.id}><div className="set-check"><Check size={15}/></div><div><strong>{set.exercise_name}</strong><small>Satz {set.set_number}</small></div><b>{set.weight_kg!=null?`${set.weight_kg} kg × ${set.repetitions}`:set.repetitions!=null?`${set.repetitions} Wdh.`:`${set.duration_seconds} s`}</b></div>)}
      </section>

      <button className="finish-btn" onClick={finishWorkout} disabled={busy||sets.length===0}>Training abschließen</button>
    </>}
    {message&&<p className="notice">{message}</p>}
  </main>
}
