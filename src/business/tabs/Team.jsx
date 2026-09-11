import { useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';

const ROLES = [
  { key: 'owner', label: 'Owner', desc: 'Everything.' },
  { key: 'admin', label: 'Admin/Manager', desc: 'Transactions, Expenses, Invoices, Reports, Team (depending on permissions).' },
  { key: 'employee', label: 'Employee', desc: 'Submit expenses, view own expenses.' },
  { key: 'accountant', label: 'Accountant', desc: 'View financial records, review, export. No billing/user-management access.' },
];

export default function Team() {
  const { members, myRole, inviteMember, updateMemberRole, removeMember } = useBusiness();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('employee');
  const [msg, setMsg] = useState('');
  const canManage = myRole === 'owner' || myRole === 'admin';

  async function invite() {
    if (!email.trim()) return;
    try {
      await inviteMember(email.trim(), role);
      setEmail(''); setMsg('Invited ' + email.trim() + '.');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setMsg(e.message); }
  }

  return (
    <section className="tab on light-tab">
      <h1>Team</h1>

      <h2>Members</h2>
      <div className="card">
        {members.length ? members.map(m => (
          <div className="row" key={m.email} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{m.email}</div>
              <div className="tag">{m.role}{m.status === 'invited' ? ' · invited, not yet joined' : ''}</div>
            </div>
            {canManage && m.role !== 'owner' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={m.role} onChange={e => updateMemberRole(m.email, e.target.value)} style={{ width: 'auto' }}>
                  {ROLES.filter(r => r.key !== 'owner').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
                <button className="b d sm" onClick={() => removeMember(m.email)}>Remove</button>
              </div>
            )}
          </div>
        )) : <div className="mini">No members yet.</div>}
      </div>

      {canManage && (
        <>
          <h2>Invitations</h2>
          <div className="card">
            <label style={{ marginTop: 0 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@example.com" />
            <label>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              {ROLES.filter(r => r.key !== 'owner').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            {msg && <div className="msg s">{msg}</div>}
            <div style={{ height: 10 }} />
            <button className="b" onClick={invite}>Send Invitation</button>
            <div className="mini" style={{ marginTop: 8 }}>They'll get access the next time they sign in to Budget with this email - no invite email is sent automatically yet, so let them know directly.</div>
          </div>
        </>
      )}

      <h2>Roles &amp; Permissions</h2>
      <div className="card">
        {ROLES.map(r => (
          <div key={r.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 700 }}>{r.label}</div>
            <div className="mini">{r.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 20 }} />
    </section>
  );
}
