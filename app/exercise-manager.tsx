'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dumbbell, Pencil, Plus, Trash2, X } from 'lucide-react'
import styles from './features.module.css'

type Group = { id: string; role: 'ADMIN' | 'MEMBER' }
type Exercise = {
  id: string
  name: string
  category: string
  measurement_type: 'WEIGHT_REPS' | 'REPS' | 'TIME' | string
}

const measurementLabels: Record<string, string> = {
  WEIGHT_REPS: 'Gewicht + Wdh.',
  REPS: 'Nur Wiederholungen',
  TIME: 'Zeit',
}

export default function ExerciseManager({
  userId,
  group,
  onChanged,
}: {
  userId: string
  group: Group
  onChanged?: () => void | Promise<void>
}) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<Exercise[]>([])
  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Sonstige')
  const [measurementType, setMeasurementType] = useState<'WEIGHT_REPS' | 'REPS' | 'TIME'>('WEIGHT_REPS')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('id,name,category,measurement_type')
      .eq('group_id', group.id)
      .eq('scope', 'GROUP')
      .eq('is_active', true)
      .order('category')
      .order('name')

    if (error) {
      setMessage(error.message)
      return
    }
    setItems((data || []) as Exercise[])
  }, [group.id, supabase])

  useEffect(() => { void load() }, [load])

  function resetEditor() {
    setEditingId(null)
    setName('')
    setCategory('Sonstige')
    setMeasurementType('WEIGHT_REPS')
    setShowEditor(false)
  }

  function startCreate() {
    setMessage('')
    setEditingId(null)
    setName('')
    setCategory('Sonstige')
    setMeasurementType('WEIGHT_REPS')
    setShowEditor(true)
  }

  function startEdit(exercise: Exercise) {
    setMessage('')
    setEditingId(exercise.id)
    setName(exercise.name)
    setCategory(exercise.category)
    setMeasurementType((exercise.measurement_type as 'WEIGHT_REPS' | 'REPS' | 'TIME') || 'WEIGHT_REPS')
    setShowEditor(true)
  }

  async function save() {
    if (!name.trim() || !category.trim() || group.role !== 'ADMIN') return
    setBusy(true)
    setMessage('')

    const payload = {
      name: name.trim(),
      category: category.trim(),
      measurement_type: measurementType,
    }

    const result = editingId
      ? await supabase.from('exercises').update(payload).eq('id', editingId).eq('group_id', group.id)
      : await supabase.from('exercises').insert({
          ...payload,
          scope: 'GROUP',
          group_id: group.id,
          created_by: userId,
          is_active: true,
        })

    if (result.error) {
      setMessage(result.error.message)
      setBusy(false)
      return
    }

    const wasEditing = Boolean(editingId)
    resetEditor()
    setMessage(wasEditing ? 'Übung aktualisiert.' : 'Übung angelegt und für die Gruppe freigegeben.')
    await load()
    await onChanged?.()
    setBusy(false)
  }

  async function remove(exercise: Exercise) {
    if (group.role !== 'ADMIN') return
    if (!window.confirm(`„${exercise.name}“ wirklich aus der Übungsbibliothek entfernen? Bereits gespeicherte Trainings bleiben erhalten.`)) return

    setBusy(true)
    setMessage('')
    const { error } = await supabase
      .from('exercises')
      .update({ is_active: false })
      .eq('id', exercise.id)
      .eq('group_id', group.id)

    if (error) setMessage(error.message)
    else {
      if (editingId === exercise.id) resetEditor()
      setMessage('Übung entfernt. Alte Trainingsdaten bleiben erhalten.')
      await load()
      await onChanged?.()
    }
    setBusy(false)
  }

  return <div className={styles.sectionCard}>
    <div className={styles.sectionHead}>
      <h3><Dumbbell size={17}/> Eigene Übungen</h3>
      <span>{items.length}</span>
    </div>

    <p className="muted">Ergänzt die festen Basisübungen. Eigene Gruppenübungen können vom Admin angelegt, geändert und entfernt werden.</p>

    {items.length > 0 && <div className={styles.templateManageList}>
      {items.map(exercise => <div className={styles.templateManageCard} key={exercise.id}>
        <div className={styles.templateManageCopy}>
          <strong>{exercise.name}</strong>
          <small>{exercise.category} · {measurementLabels[exercise.measurement_type] || exercise.measurement_type}</small>
        </div>
        {group.role === 'ADMIN' && <div className={styles.templateActions}>
          <button type="button" onClick={() => startEdit(exercise)} disabled={busy}><Pencil size={15}/> Bearbeiten</button>
          <button type="button" className={styles.dangerAction} onClick={() => void remove(exercise)} disabled={busy}><Trash2 size={15}/> Löschen</button>
        </div>}
      </div>)}
    </div>}

    {items.length === 0 && <p className="muted">Noch keine eigenen Übungen angelegt.</p>}

    {group.role === 'ADMIN' && <>
      {!showEditor && <button className={styles.adminToggle} type="button" onClick={startCreate}><Plus size={17}/> Übung anlegen</button>}

      {showEditor && <div className={styles.builder}>
        <div className={styles.builderTitle}>
          <div>
            <div className="eyebrow">{editingId ? 'Übung bearbeiten' : 'Neue Übung'}</div>
            <strong>{editingId ? 'Daten anpassen' : 'Für die Gruppe anlegen'}</strong>
          </div>
          <button type="button" onClick={resetEditor} aria-label="Schließen"><X size={18}/></button>
        </div>

        <label className="field-label">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Face Pulls" />

        <label className="field-label">Kategorie</label>
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="z. B. Schultern" />

        <label className="field-label">Messart</label>
        <select className="select-input" value={measurementType} onChange={e => setMeasurementType(e.target.value as 'WEIGHT_REPS' | 'REPS' | 'TIME')}>
          <option value="WEIGHT_REPS">Gewicht + Wiederholungen</option>
          <option value="REPS">Nur Wiederholungen</option>
          <option value="TIME">Zeit</option>
        </select>

        <div className={styles.builderFooter}>
          <button className="primary-btn" type="button" onClick={save} disabled={busy || !name.trim() || !category.trim()}>
            {editingId ? <Pencil size={17}/> : <Plus size={17}/>} {busy ? 'Speichert …' : editingId ? 'Änderungen speichern' : 'Übung speichern'}
          </button>
          <button type="button" className={styles.cancelBuilder} onClick={resetEditor} disabled={busy}>Abbrechen</button>
        </div>
      </div>}
    </>}

    {group.role !== 'ADMIN' && <p className="muted">Neue Gruppenübungen werden vom Admin verwaltet.</p>}
    {message && <p className="notice">{message}</p>}
  </div>
}
