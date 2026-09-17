'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Copy, Flame, LogOut, Plus, Users } from 'lucide-react'

type Group = { id: string; name: string; invite_code: string; role: 'ADMIN' | 'MEMBER' }
type Member = { user_id: string; role: 'ADMIN' | 'MEMBER'; display_name: string }

export default function GroupPanel({ userId, group, onLogout }: { userId: string; group: Group; onLogout: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [members, setMembers] = useState<Member[]>([])
  const [copied, setCopied] = useState(false)
  const [showChallenge, setShowChallenge] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [target, setTarget] = useState('1')
  const [days, setDays] = useState('7')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const loadMembers = useCallback(async () => {
    const { data: membershipRows } = await supabase.from('group_members').select('user_id,role').eq('group_id', group.id).order('joined_at')
    const ids = (membershipRows || []).map((m: any) => m.user_id)
    const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,display_name').in('id', ids) : { data: [] as any[] }
    const names = new Map<string,string>((profiles || []).map((p: any) => [p.id, p.display_name] as [string,string]))
    setMembers((membershipRows || []).map((m: any) => ({ user_id: m.user_id, role: m.role, display_name: names.get(m.user_id) || 'Mitglied' })))
  }, [group.id, supabase])

  useEffect(() => { void loadMembers() }, [loadMembers])

  async function copyCode() {
    await navigator.clipboard.writeText(group.invite_code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  async function createChallenge() {
    if (!title.trim()) return
    setBusy(true)
    setMessage('')
    const end = new Date()
    end.setDate(end.getDate() + Math.max(1, Number(days) || 7))
    const { error } = await supabase.from('challenges').insert({
      group_id: group.id,
      title: title.trim(),
      description: description.trim() || null,
      target_count: Math.max(1, Number(target) || 1),
      starts_at: new Date().toISOString(),
      ends_at: end.toISOString(),
      created_by: userId,
    })
    if (error) setMessage(error.message)
    else {
      setMessage('Challenge ist aktiv und erscheint jetzt bei allen auf der Heute-Seite.')
      setTitle('')
      setDescription('')
      setTarget('1')
      setShowChallenge(false)
    }
    setBusy(false)
  }

  return <section className="screen-pad">
    <div className="eyebrow">Deine Gruppe</div>
    <h2 className="screen-title">{group.name}</h2>

    <div className="group-code">
      <span>Einladungscode</span>
      <strong>{group.invite_code}</strong>
      <small>{members.length} {members.length === 1 ? 'Mitglied' : 'Mitglieder'}</small>
      <button className="copy-code" onClick={copyCode}><Copy size={15}/>{copied ? 'Kopiert' : 'Code kopieren'}</button>
    </div>

    {group.role === 'ADMIN' && <>
      <button className="admin-action" onClick={() => setShowChallenge(v => !v)}><Flame size={18}/>{showChallenge ? 'Challenge schließen' : 'Neue Challenge'}</button>
      {showChallenge && <div className="admin-form">
        <div className="eyebrow">Wochenchallenge anlegen</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. 3 × 50 Liegestütze" />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Kurze Beschreibung (optional)" />
        <div className="admin-grid"><div><label>Zielwert</label><input inputMode="numeric" value={target} onChange={e => setTarget(e.target.value)} /></div><div><label>Laufzeit (Tage)</label><input inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} /></div></div>
        <button className="primary-btn" onClick={createChallenge} disabled={busy || !title.trim()}><Plus size={17}/>{busy ? 'Wird angelegt …' : 'Challenge starten'}</button>
      </div>}
    </>}

    {message && <p className="notice">{message}</p>}

    <div className="list-card member-card">
      <div className="section-heading"><h2>Mitglieder</h2><span>{members.length}</span></div>
      {members.map(member => <div className="row" key={member.user_id}>
        <div><strong>{member.display_name}</strong><small>{member.role === 'ADMIN' ? 'Admin' : 'Mitglied'}</small></div>
        <div className={`mini-avatar ${member.user_id === userId ? 'me' : ''}`}>{member.display_name.slice(0,1).toUpperCase()}</div>
      </div>)}
      {!members.length && <div className="empty-feed"><Users size={24}/><p>Noch keine Mitglieder gefunden.</p></div>}
    </div>

    <button className="logout-btn" onClick={onLogout}><LogOut size={18}/> Abmelden</button>
  </section>
}
