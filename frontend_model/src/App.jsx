import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const statusNames = { awaiting_review: 'Awaiting review', submitted: 'Submitted', assigned: 'Assigned', in_progress: 'In progress', resolved: 'Resolved', reopened: 'Reopened' }
const issueNames = { pothole: 'Pothole', water_leak: 'Water leak', garbage: 'Waste & garbage', streetlight: 'Streetlight', bridge_crack: 'Bridge crack / damage', other: 'Other issue', not_civic: 'Not a civic issue' }
const departments = ['Roads', 'Roads & Bridges', 'Water', 'Sanitation', 'Electrical', 'Triage desk']
const issues = ['pothole', 'water_leak', 'garbage', 'streetlight', 'bridge_crack', 'other', 'not_civic']

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, options)
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try { message = (await response.json()).detail || message } catch { /* response was not JSON */ }
    throw new Error(message)
  }
  return response.json()
}
function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    inbox: <><path d="M4 4h16v16H4z" /><path d="M4 13h4l2 3h4l2-3h4" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    upload: <><path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M5 14v5h14v-5" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    alert: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  }
  return <svg {...common}>{paths[name] || paths.grid}</svg>
}
function shortDate(value) { return value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—' }
function severityLabel(value) { return value >= 4 ? 'High' : value === 3 ? 'Medium' : 'Low' }
function statusDisabled(current, next) { if (current === 'resolved') return next !== current && next !== 'reopened'; if (current === 'reopened') return !['assigned', 'in_progress', 'resolved'].includes(next); const order = ['awaiting_review', 'submitted', 'assigned', 'in_progress', 'resolved']; return order.indexOf(next) < order.indexOf(current) }
function Badge({ children, tone = '' }) { return <span className={`badge ${tone}`}>{children}</span> }
function App() {
  const [section, setSection] = useState('Overview')
  const [summary, setSummary] = useState(null)
  const [publicDash, setPublicDash] = useState(null)
  const [tickets, setTickets] = useState([])
  const [queue, setQueue] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ search: '', status: '', issue_type: '' })
  const [selected, setSelected] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [health, setHealth] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const [stats, list, review, accountability] = await Promise.all([
        api('/api/analytics/summary'), api('/api/tickets?limit=100'), api('/api/staff/review-queue?limit=100'), api('/api/public/dashboard'),
      ])
      setSummary(stats); setTickets(list.items || []); setQueue(review.items || [])
      setPublicDash(accountability)
      setHealth(true)
    } catch (e) { setError(e.message); setHealth(false) }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const visible = useMemo(() => tickets.filter((t) => {
    const needle = filters.search.toLowerCase()
    return (!needle || `${t.id} ${t.description || ''} ${t.department || ''} ${issueNames[t.issue_type] || ''}`.toLowerCase().includes(needle)) &&
      (!filters.status || t.status === filters.status) && (!filters.issue_type || t.issue_type === filters.issue_type)
  }), [tickets, filters])
  const openTicket = useCallback(async (ticket) => {
    try { setSelected(await api(`/api/tickets/${ticket.id}`)) } catch (e) { setError(e.message) }
  }, [])
  const navigate = (label) => { setSection(label); setFilters({ search: '', status: '', issue_type: '' }) }

  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); navigate('Overview') }}><span className="brand-mark"><Icon name="pin" size={21} /></span><span><strong>civic<span>line</span></strong><small>PUBLIC SERVICE DESK</small></span></a>
      <div className="workspace"><span className="workspace-dot" /> CITY OPERATIONS <span className="chevron">⌄</span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="nav">
        {[['Overview', 'grid'], ['Public map', 'pin'], ['All reports', 'inbox'], ['Review queue', 'alert'], ['Department queue', 'inbox'], ['Ward leaderboard', 'chart'], ['Insights', 'chart'], ['Routing rules', 'grid']].map(([label, icon]) => <button key={label} className={`nav-link ${section === label ? 'active' : ''}`} onClick={() => navigate(label)}><Icon name={icon} />{label}{label === 'Review queue' && queue.length > 0 && <span className="nav-count">{queue.length}</span>}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><Icon name="alert" /></span><strong>Need a hand?</strong><p>Find guidance for reviewing community reports.</p><a href="#guide" onClick={(e) => e.preventDefault()}>View help center <Icon name="arrow" size={14} /></a></div><div className="profile"><div className="avatar">JD</div><div><strong>Jordan Davis</strong><small>Operations staff</small></div><span className="more">···</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Civic operations <span>/</span> <b>{section}</b></div><div className="top-actions"><span className={`api-status ${health ? 'online' : ''}`}><i />{health ? 'System operational' : 'API disconnected'}</span><button className="icon-button" aria-label="Refresh data" onClick={refresh}><span className={busy ? 'spin' : ''}>↻</span></button><div className="avatar small-avatar">JD</div></div></header>
      {error && <div className="error-banner"><Icon name="alert" size={17} /><span>{error}. Check that the backend is running at <code>{API}</code>.</span><button onClick={refresh}>Retry</button></div>}
      {section === 'Overview' && <Overview summary={summary} tickets={tickets} queue={queue} publicDash={publicDash} busy={busy} onReport={() => setShowReport(true)} onView={openTicket} onNavigate={navigate} />}
      {section === 'Public map' && <PublicMap publicDash={publicDash} onView={openTicket} />}
      {section === 'All reports' && <Reports tickets={visible} filters={filters} setFilters={setFilters} busy={busy} onView={openTicket} onReport={() => setShowReport(true)} />}
      {section === 'Review queue' && <ReviewQueue queue={queue} busy={busy} onView={openTicket} />}
      {section === 'Department queue' && <DepartmentQueue onView={openTicket} />}
      {section === 'Ward leaderboard' && <WardLeaderboard data={publicDash} onView={openTicket} />}
      {section === 'Insights' && <Insights summary={summary} tickets={tickets} publicDash={publicDash} busy={busy} />}
      {section === 'Routing rules' && <RoutingRules />}
    </main>
    {selected && <TicketModal ticket={selected} onClose={() => setSelected(null)} onUpdated={() => { setSelected(null); refresh() }} />}
    {showReport && <ReportModal onClose={() => setShowReport(false)} onCreated={(ticket) => { setShowReport(false); refresh(); setSection('All reports'); openTicket(ticket) }} />}
  </div>
}
function PageTitle({ eyebrow, title, description, action }) { return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div> }
function Overview({ summary, tickets, queue, publicDash, busy, onReport, onView, onNavigate }) {
  const recent = tickets.slice(0, 5), total = summary?.total_real_tickets || 0
  const inProgress = (summary?.by_status?.assigned || 0) + (summary?.by_status?.in_progress || 0)
  const today = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()
  return <div className="page-wrap"><PageTitle eyebrow={today} title="Good morning, Jordan" description="Here’s what’s happening across your community today." action={<button className="primary-button" onClick={onReport}><Icon name="plus" /> New report</button>} />
    <section className="metric-grid"><Metric icon="pin" label="Unique issues" value={summary?.unique_real_issues ?? total} change={`${total} community reports`} tint="blue" /><Metric icon="clock" label="Needs review" value={summary?.awaiting_human_review ?? '—'} change="Requires staff attention" tint="amber" /><Metric icon="inbox" label="In progress" value={inProgress} change="Assigned to departments" tint="purple" /><Metric icon="check" label="Resolved" value={summary?.by_status?.resolved || 0} change="Successfully addressed" tint="green" /></section>
    <section className="overview-grid"><div className="panel recent-panel"><div className="panel-head"><div><h2>Recent reports</h2><p>The latest issues raised by your community</p></div><button className="text-button" onClick={() => onNavigate('All reports')}>View all <Icon name="arrow" size={15} /></button></div><TicketTable tickets={recent} busy={busy} onView={onView} compact /></div><div className="panel queue-panel"><div className="panel-head"><div><h2>Needs your attention</h2><p>Reports flagged for a closer look</p></div><span className="round-icon"><Icon name="inbox" size={18} /></span></div>{queue.length ? <div className="attention-list">{queue.slice(0, 3).map((ticket) => <button key={ticket.id} className="attention-row" onClick={() => onView(ticket)}><span className="attention-symbol"><Icon name={ticket.severity >= 4 ? 'alert' : 'clock'} size={17} /></span><span className="attention-copy"><strong>{issueNames[ticket.issue_type] || 'Community report'}</strong><small>{ticket.review_reasons?.[0] || ticket.department || 'Staff review requested'}</small></span><span className="attention-time">{shortDate(ticket.created_at).split(',')[0]}</span></button>)}</div> : <div className="empty-small"><span className="empty-check"><Icon name="check" /></span><strong>All caught up</strong><p>No reports are waiting for review.</p></div>}<button className="queue-link" onClick={() => onNavigate('Review queue')}>Open review queue <Icon name="arrow" size={15} /></button></div></section>
    <section className="panel trend-panel"><div className="panel-head"><div><h2>Report overview</h2><p>Unique community issues by category</p></div><button className="select-like" onClick={() => onNavigate('Insights')}>All time <span>⌄</span></button></div><IssueBars summary={summary} /></section>
    <section className="panel oldest-panel"><div className="panel-head"><div><h2>Oldest unresolved issues</h2><p>Public issues still waiting for resolution</p></div><button className="text-button" onClick={() => onNavigate('Public map')}>Accountability view <Icon name="arrow" size={15} /></button></div><OldestTable issues={publicDash?.oldest_unresolved || []} onView={onView} /></section>
  </div>
}
function Metric({ icon, label, value, change, tint }) { return <article className="metric-card"><div className={`metric-icon ${tint}`}><Icon name={icon} /></div><div className="metric-value">{value}</div><div className="metric-label">{label}</div><div className="metric-change">{change}</div></article> }
function TicketTable({ tickets, busy, onView, compact = false }) {
  if (busy && !tickets.length) return <div className="table-empty">Loading reports…</div>
  if (!tickets.length) return <div className="table-empty">No reports found. New community reports will appear here.</div>
  return <div className="table-scroll"><table><thead><tr><th>REPORT</th><th>DEPARTMENT</th><th>SEVERITY</th><th>STATUS</th><th>DATE</th><th /></tr></thead><tbody>{tickets.map((t) => <tr key={t.id} onClick={() => onView(t)}><td><span className="report-cell"><span className={`issue-icon ${t.issue_type}`}><Icon name={t.issue_type === 'pothole' ? 'pin' : t.issue_type === 'water_leak' ? 'alert' : t.issue_type === 'garbage' ? 'inbox' : 'grid'} size={16} /></span><span><strong>{issueNames[t.issue_type] || 'Community report'}</strong><small>#{t.id.slice(0, 8)}{t.duplicate_count > 1 ? ` · ${t.duplicate_count} nearby reports` : t.description ? ` · ${t.description.slice(0, 46)}` : ''}</small></span></span></td><td>{t.department || '—'}</td><td><Badge tone={`severity-${severityLabel(t.severity).toLowerCase()}`}><i />{severityLabel(t.severity)} · {t.severity_score ?? t.severity * 20}/100</Badge></td><td><Badge tone={`status-${t.status}`}>{statusNames[t.status] || t.status}</Badge></td><td className="date-cell">{shortDate(t.created_at)}</td><td><span className="row-arrow">↗</span></td></tr>)}</tbody></table></div>
}
function Reports({ tickets, filters, setFilters, busy, onView, onReport }) {
  return <div className="page-wrap"><PageTitle eyebrow="COMMUNITY INBOX" title="All reports" description="Search, filter and track issues submitted by your community." action={<button className="primary-button" onClick={onReport}><Icon name="plus" /> New report</button>} /><section className="panel reports-panel"><div className="filter-bar"><label className="search-field"><Icon name="search" size={17} /><input placeholder="Search reports, IDs, departments..." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} /></label><select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option>{Object.entries(statusNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><select value={filters.issue_type} onChange={e => setFilters({ ...filters, issue_type: e.target.value })}><option value="">All issue types</option>{issues.map(k => <option key={k} value={k}>{issueNames[k]}</option>)}</select><span className="result-count">{tickets.length} reports</span></div><TicketTable tickets={tickets} busy={busy} onView={onView} /></section></div>
}
function ReviewQueue({ queue, busy, onView }) { return <div className="page-wrap"><PageTitle eyebrow="STAFF WORKSPACE" title="Review queue" description="Reports that need a human decision before they move forward." action={<Badge tone="status-awaiting_review">{queue.length} awaiting review</Badge>} /><div className="review-note"><span><Icon name="alert" size={18} /></span><p><strong>Review with care</strong>Check the evidence and context, then update the report to validate it. Your decision and reason will be recorded in its audit history.</p></div><section className="panel reports-panel"><TicketTable tickets={queue} busy={busy} onView={onView} /></section></div> }
function IssueBars({ summary }) { const data = Object.entries(summary?.by_issue_type || {}).sort((a, b) => b[1] - a[1]); const max = Math.max(...data.map(x => x[1]), 1); return <div className="bars">{data.length ? data.map(([issue, n]) => <div className="bar-row" key={issue}><span>{issueNames[issue] || issue}</span><div className="bar-track"><i style={{ width: `${Math.max(5, n / max * 100)}%` }} /></div><b>{n}</b></div>) : <div className="table-empty">Issue trends will appear when reports are submitted.</div>}</div> }
function Insights({ summary, tickets, publicDash, busy }) {
  const total = summary?.total_real_tickets || 0
  const coverage = summary?.high_severity_review_coverage
  const rows = publicDash?.department_metrics || []
  return <div className="page-wrap"><PageTitle eyebrow="SERVICE PERFORMANCE" title="Department insights" description="Resolution speed, SLA performance, reopen rate and active backlog." /><section className="metric-grid insights-metrics"><Metric icon="pin" label="Unique issues" value={summary?.unique_real_issues ?? total} change={`${total} real reports submitted`} tint="blue" /><Metric icon="alert" label="High severity" value={tickets.filter(t => !t.is_simulated && t.severity >= 4).length} change="Risk score 60 or above" tint="amber" /><Metric icon="inbox" label="Awaiting review" value={summary?.awaiting_human_review ?? '—'} change="Reports requiring staff attention" tint="purple" /><Metric icon="check" label="Review coverage" value={coverage == null ? '—' : `${Math.round(coverage * 100)}%`} change="High severity issues flagged" tint="green" /></section><section className="panel insights-chart"><div className="panel-head"><div><h2>Unique issues by category</h2><p>Duplicate reports are grouped under one issue</p></div></div><IssueBars summary={summary} /></section><section className="panel reports-panel"><div className="panel-head"><div><h2>Department service levels</h2><p>Median is calculated from initial report to first resolution</p></div></div><DepartmentTable rows={rows} busy={busy} /></section></div>
}
function DepartmentTable({ rows, busy }) { return <div className="table-scroll"><table><thead><tr><th>DEPARTMENT</th><th>MEDIAN RESOLUTION</th><th>SLA BREACH</th><th>REOPEN RATE</th><th>BACKLOG</th></tr></thead><tbody>{rows.map(row => <tr key={row.department}><td><strong>{row.department}</strong></td><td>{row.median_resolve_hours == null ? 'No resolutions yet' : `${row.median_resolve_hours} hours`}</td><td>{Math.round(row.sla_breach_rate * 100)}%</td><td>{Math.round(row.reopen_rate * 100)}%</td><td>{row.backlog}</td></tr>)}{!busy && !rows.length && <tr><td colSpan="5">No service data available.</td></tr>}</tbody></table></div> }
function OldestTable({ issues: rows, onView }) { if (!rows.length) return <div className="table-empty">No unresolved issues. The public list updates as reports arrive.</div>; return <div className="oldest-list">{rows.slice(0, 5).map(issue => <button key={issue.id} onClick={() => onView(issue)}><span className="oldest-rank">{issue.ward_name || 'Citywide'}</span><span className="oldest-main"><b>{issueNames[issue.issue_type] || 'Community issue'}</b><small>#{issue.id.slice(0, 8)} · {issue.department} · {issue.duplicate_count} linked reports</small></span><Badge tone={`status-${issue.status}`}>{statusNames[issue.status] || issue.status}</Badge><span className="oldest-date">{shortDate(issue.created_at)}</span></button>)}</div> }
function PublicMap({ publicDash, onView }) {
  const [filters, setFilters] = useState({ category: '', status: '', ward_id: '' }), [items, setItems] = useState(publicDash?.items || []), [loading, setLoading] = useState(false), [mapReady, setMapReady] = useState(false), [mapError, setMapError] = useState('')
  const containerRef = useRef(null), mapRef = useRef(null), layersRef = useRef(null)
  useEffect(() => { let active = true; setLoading(true); const query = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))); api(`/api/public/dashboard?${query}`).then(data => { if (active) setItems(data.items || []) }).catch(() => { }).finally(() => active && setLoading(false)); return () => { active = false } }, [filters])

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, { minZoom: 2, maxZoom: 19, maxBounds: [[-85.0511, -180], [85.0511, 180]], maxBoundsViscosity: 1, zoomControl: true, attributionControl: true }).setView([20.5937, 78.9629], 5)
    mapRef.current = map
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    tiles.on('tileerror', () => setMapError('OpenStreetMap tiles could not be loaded. Check your internet connection.'))
    tiles.on('tileload', () => setMapError(''))
    layersRef.current = L.featureGroup().addTo(map)
    L.control.scale({ imperial: false }).addTo(map)
    setMapReady(true)
    const resize = window.setTimeout(() => map.invalidateSize(), 100)
    return () => { window.clearTimeout(resize); setMapReady(false); layersRef.current?.clearLayers(); map.remove(); mapRef.current = null; layersRef.current = null }
  }, [])


  const boundaries = useMemo(() => publicDash?.ward_boundaries || [], [publicDash])
  const mappableItems = useMemo(() => items.filter(item => {
    if (item.latitude == null || item.longitude == null || item.latitude === '' || item.longitude === '') return false
    const lat = Number(item.latitude), lon = Number(item.longitude)
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85.0511 && Math.abs(lon) <= 180
  }), [items])
  useEffect(() => {
    if (!mapReady || !mapRef.current || !layersRef.current) return
    const layer = layersRef.current, map = mapRef.current
    layer.clearLayers()
    for (const ward of boundaries) {
      const polygon = (ward.polygon || []).map(point => [Number(point[0]), Number(point[1])])
      if (polygon.length < 3 || polygon.some(([lat, lon]) => !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85.0511 || Math.abs(lon) > 180)) continue
      L.polygon(polygon, { color: '#147b9c', weight: 2, dashArray: '7 5', fillColor: '#5db1c5', fillOpacity: .08 })
        .bindTooltip(ward.name || ward.ward_id, { sticky: true }).addTo(layer)
    }
    const issuePoints = []
    for (const item of mappableItems) {
      const lat = Number(item.latitude), lon = Number(item.longitude), position = [lat, lon]
      issuePoints.push(position)
      const color = item.severity >= 4 ? '#c64339' : item.status === 'resolved' ? '#16815a' : '#1675ac'
      const count = Math.max(1, Number(item.duplicate_count) || 1)
      const marker = L.circleMarker(position, { radius: 9, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1, bubblingMouseEvents: false })
      marker.on('click', () => map.flyTo(position, Math.max(map.getZoom(), 17), { duration: 0.6 }))
      const popup = document.createElement('div')
      popup.className = 'issue-map-popup'
      const title = document.createElement('strong')
      title.textContent = issueNames[item.issue_type] || 'Community issue'
      const statusLine = document.createElement('span')
      statusLine.textContent = `${statusNames[item.status] || item.status} · Risk ${item.severity_score ?? item.severity * 20}/100 · ${count} report${count === 1 ? '' : 's'} · ${lat.toFixed(5)}, ${lon.toFixed(5)}`
      const open = document.createElement('button')
      open.type = 'button'
      open.textContent = 'View issue details'
      open.addEventListener('click', () => onView(item))
      popup.append(title, statusLine, open)
      marker.bindPopup(popup, { closeButton: true })
      marker.addTo(layer)
    }
    if (issuePoints.length === 1) map.setView(issuePoints[0], 16)
    else if (issuePoints.length > 1) map.fitBounds(L.latLngBounds(issuePoints).pad(0.2), { maxZoom: 16 })
    else map.setView([20.5937, 78.9629], 5)
    map.invalidateSize()
  }, [mapReady, items, mappableItems, boundaries, onView])
  const wardOptions = publicDash?.ward_options || []
  return <div className="page-wrap"><PageTitle eyebrow="PUBLIC ACCOUNTABILITY" title="Community issue map" description="Explore geolocated reports. Click a marker to zoom in and open its issue record." action={<span className="public-stamp">PUBLIC DATA · LIVE</span>} /><section className="panel map-panel"><div className="map-toolbar"><select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{issues.map(k => <option key={k} value={k}>{issueNames[k]}</option>)}</select><select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option>{Object.entries(statusNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><select value={filters.ward_id} onChange={e => setFilters({ ...filters, ward_id: e.target.value })}><option value="">All wards</option>{wardOptions.map(w => <option key={w.ward_id} value={w.ward_id}>{w.ward_name}</option>)}</select><span>{loading ? 'Updating…' : `${mappableItems.length} mapped issues`}</span></div><div className="map-canvas interactive-map" ref={containerRef} aria-label="Interactive map of community issues">{!mappableItems.length && mapReady && <div className="map-empty">{items.length ? 'These reports have coordinates outside the map’s supported range.' : 'No reports with a valid location match these filters.'}</div>}{mapError && <div className="map-error">{mapError}<small>The map needs an internet connection to load OpenStreetMap tiles.</small></div>}</div><div className="map-legend"><span><i className="urgent-dot" />High risk</span><span><i className="active-dot" />Open issue</span><span><i className="resolved-dot" />Resolved</span><small>Click any issue marker to zoom in, then select View issue details.</small></div></section></div>
}

function WardLeaderboard({ data, onView }) { const wards = data?.ward_leaderboard || []; return <div className="page-wrap"><PageTitle eyebrow="PUBLIC ACCOUNTABILITY" title="Ward leaderboard" description="Compare issue volumes, resolution rates and backlogs across wards." action={<span className="public-stamp">PUBLIC DATA</span>} /><section className="panel reports-panel"><div className="panel-head"><div><h2>Resolution performance by ward</h2><p>Wards with configured boundary polygons are shown by name.</p></div></div><div className="table-scroll"><table><thead><tr><th>RANK</th><th>WARD</th><th>ISSUES</th><th>RESOLVED</th><th>RESOLUTION RATE</th><th>BACKLOG</th></tr></thead><tbody>{wards.map((w, i) => <tr key={w.ward_id}><td><span className="rank-chip">{String(i + 1).padStart(2, '0')}</span></td><td><b>{w.ward_name}</b></td><td>{w.issues}</td><td>{w.resolved}</td><td><span className="rate-bar"><i style={{ width: `${w.resolution_rate * 100}%` }} /></span> {Math.round(w.resolution_rate * 100)}%</td><td>{w.backlog}</td></tr>)}</tbody></table>{!wards.length && <div className="table-empty">Configure ward polygons to populate this leaderboard.</div>}</div></section><section className="panel oldest-panel"><div className="panel-head"><div><h2>Oldest unresolved issues</h2><p>Open issue list for public follow-up</p></div></div><OldestTable issues={data?.oldest_unresolved || []} onView={onView} /></section></div> }
function DepartmentQueue({ onView }) {
  const [department, setDepartment] = useState(departments[0]), [items, setItems] = useState([]), [total, setTotal] = useState(0), [error, setError] = useState('')
  useEffect(() => { api(`/api/departments/${encodeURIComponent(department)}/queue`).then(data => { setItems(data.items || []); setTotal(data.total || 0); setError('') }).catch(e => setError(e.message)) }, [department])
  return <div className="page-wrap"><PageTitle eyebrow="DEPARTMENT OPERATIONS" title="Department queue" description="Open issues assigned to the selected department, ordered by risk and age." action={<select className="queue-dept-select" value={department} onChange={e => setDepartment(e.target.value)}>{departments.map(d => <option key={d}>{d}</option>)}</select>} />{error && <div className="error-banner">{error}</div>}<section className="panel reports-panel"><div className="panel-head"><div><h2>{department}</h2><p>{total} open canonical issues · follow escalation path in each issue record</p></div></div><TicketTable tickets={items} busy={false} onView={onView} /></section></div>
}
function RoutingRules() {
  const [rules, setRules] = useState([]), [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ issue_type: '', ward_id: '', department: 'Roads', officer: '', queue: '', sla_hours: 48, priority: 50 })
  const load = useCallback(async () => { try { setRules(await api('/api/staff/routing/rules')) } catch (e) { setError(e.message) } }, [])
  useEffect(() => { load() }, [load])
  async function addRule(e) { e.preventDefault(); setSaving(true); setError(''); try { await api('/api/staff/routing/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, issue_type: form.issue_type || null, ward_id: form.ward_id || null, officer: form.officer || null, queue: form.queue || null, sla_hours: Number(form.sla_hours), priority: Number(form.priority) }) }); await load() } catch (err) { setError(err.message) } finally { setSaving(false) } }
  async function disable(id) { try { await api(`/api/staff/routing/rules/${id}`, { method: 'DELETE' }); await load() } catch (e) { setError(e.message) } }
  return <div className="page-wrap"><PageTitle eyebrow="OPERATIONS CONFIGURATION" title="Routing rules" description="Match issue category and ward to a department, officer, queue and SLA." /><section className="panel rule-builder"><div className="panel-head"><div><h2>Add a routing rule</h2><p>Ward-specific rules take precedence over category defaults.</p></div></div><form className="rule-form" onSubmit={addRule}><label>Issue category<select value={form.issue_type} onChange={e => setForm({ ...form, issue_type: e.target.value })}><option value="">Any category (fallback)</option>{issues.map(k => <option key={k} value={k}>{issueNames[k]}</option>)}</select></label><label>Ward ID<input value={form.ward_id} onChange={e => setForm({ ...form, ward_id: e.target.value })} placeholder="Any ward" /></label><label>Department<select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>{departments.map(d => <option key={d}>{d}</option>)}</select></label><label>Officer<input value={form.officer} onChange={e => setForm({ ...form, officer: e.target.value })} placeholder="Officer or empty" /></label><label>Queue<input value={form.queue} onChange={e => setForm({ ...form, queue: e.target.value })} placeholder="Department queue" /></label><label>SLA hours<input type="number" min="1" value={form.sla_hours} onChange={e => setForm({ ...form, sla_hours: e.target.value })} /></label><label>Priority<input type="number" min="1" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} /></label><button className="primary-button" disabled={saving}>{saving ? 'Saving rule…' : 'Add rule'}</button></form>{error && <div className="inline-error">{error}</div>}</section><section className="panel reports-panel"><div className="panel-head"><div><h2>Routing table</h2><p>Fallback rules include JE → AE → EE → Commissioner escalation.</p></div></div><div className="table-scroll"><table><thead><tr><th>PRIORITY</th><th>CATEGORY</th><th>WARD</th><th>DEPARTMENT / OFFICER</th><th>QUEUE</th><th>SLA</th><th /></tr></thead><tbody>{rules.map(rule => <tr key={rule.id} className={!rule.active ? 'inactive-rule' : ''}><td>{rule.priority}</td><td>{rule.issue_type ? issueNames[rule.issue_type] : 'Any issue'}</td><td>{rule.ward_id || 'All wards'}</td><td>{rule.department}{rule.officer ? ` · ${rule.officer}` : ''}</td><td>{rule.queue || rule.department}</td><td>{rule.sla_hours}h</td><td>{rule.active ? <button className="table-action" onClick={() => disable(rule.id)}>Disable</button> : <Badge>Disabled</Badge>}</td></tr>)}</tbody></table></div></section></div>
}

function getVoterId() { let id = localStorage.getItem('civic-voter-id'); if (!id) { id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('civic-voter-id', id) } return id }
function PublicEngagement({ ticket }) {
  const [comments, setComments] = useState(ticket.comments || []), [body, setBody] = useState(''), [author, setAuthor] = useState('Citizen'), [voted, setVoted] = useState(() => localStorage.getItem(`civic-voted-${ticket.id}`) === 'yes'), [votes, setVotes] = useState(ticket.me_too_count || 0), [rating, setRating] = useState(5), [ratingComment, setRatingComment] = useState(''), [message, setMessage] = useState('')
  async function vote() { try { const result = await api(`/api/tickets/${ticket.id}/votes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voter_id: getVoterId() }) }); setVotes(result.me_too_count); setVoted(result.voted); localStorage.setItem(`civic-voted-${ticket.id}`, result.voted ? 'yes' : 'no') } catch (e) { setMessage(e.message) } }
  async function comment(e) { e.preventDefault(); try { const item = await api(`/api/tickets/${ticket.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author_label: author || 'Citizen', body }) }); setComments([...comments, item]); setBody('') } catch (e) { setMessage(e.message) } }
  async function rate(e) { e.preventDefault(); try { await api(`/api/tickets/${ticket.id}/satisfaction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voter_id: getVoterId(), rating: Number(rating), comment: ratingComment || null }) }); setMessage('Thank you for rating this resolution.') } catch (e) { setMessage(e.message) } }
  return <section className="public-engagement"><div className="engage-top"><div><b>Community follow-up</b><small>Tracking ID: {ticket.id}</small><button type="button" className="copy-tracking" onClick={() => navigator.clipboard?.writeText(ticket.id)}>Copy tracking ID</button></div><button className={`secondary-button me-too ${voted ? 'voted' : ''}`} onClick={vote}>＋ Me too <b>{votes}</b></button></div><h3>Public status history</h3><ol className="status-history">{(ticket.status_history || []).map((item, index) => <li key={`${item.created_at}-${index}`}><i /><div><b>{statusNames[item.status] || item.status}</b><small>{shortDate(item.created_at)} · {item.actor}</small>{item.reason && <p>{item.reason}</p>}</div></li>)}</ol><h3>Public comments</h3><div className="comment-list">{comments.map(item => <article key={item.id}><b>{item.author_label}</b><small>{shortDate(item.created_at)}</small><p>{item.body}</p></article>)}{!comments.length && <p className="observation-note">No comments yet.</p>}</div><form className="comment-form" onSubmit={comment}><input aria-label="Display name" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Display name" maxLength="60" /><textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Add a public comment" maxLength="1200" required /><button className="secondary-button" disabled={body.trim().length < 2}>Post comment</button></form>{ticket.status === 'resolved' && <form className="rating-form" onSubmit={rate}><h3>How was the resolution?</h3><div className="rating-controls"><select value={rating} onChange={e => setRating(e.target.value)}><option value="5">★★★★★ · Excellent</option><option value="4">★★★★ · Good</option><option value="3">★★★ · Okay</option><option value="2">★★ · Poor</option><option value="1">★ · Very poor</option></select><input value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Optional feedback" maxLength="1000" /><button className="secondary-button">Submit rating</button></div>{ticket.satisfaction_average != null && <small>Average {ticket.satisfaction_average}/5 from {ticket.satisfaction_count} ratings</small>}</form>}{message && <p className="inline-error">{message}</p>}</section>
}
function TicketModal({ ticket, onClose, onUpdated }) {
  const [issue, setIssue] = useState(ticket.issue_type), [severity, setSeverity] = useState(ticket.severity), [department, setDepartment] = useState(ticket.department), [status, setStatus] = useState(ticket.status === 'awaiting_review' ? 'submitted' : ticket.status), [reason, setReason] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const audioDetectionFailed = ticket.provider_traces?.some(trace => trace.task === 'audio_events' && trace.outcome !== 'ok')
  const canUpdate = ticket.needs_human_review || status !== ticket.status || issue !== ticket.issue_type || Number(severity) !== ticket.severity || department !== ticket.department
  async function save() { setSaving(true); setError(''); try { const body = { actor: 'Jordan Davis', reason }; if (status !== ticket.status) body.status = status; if (issue !== ticket.issue_type) body.issue_type = issue; if (Number(severity) !== ticket.severity) body.severity = Number(severity); if (department !== ticket.department) body.department = department; await api(`/api/staff/tickets/${ticket.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); onUpdated() } catch (e) { setError(e.message) } finally { setSaving(false) } }
  return <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="modal detail-modal"><div className="modal-head"><div><div className="eyebrow">REPORT #{ticket.id.slice(0, 8)}</div><h2>{issueNames[ticket.issue_type] || 'Community report'}</h2></div><button className="icon-button" onClick={onClose}><Icon name="close" /></button></div><div className="detail-scroll"><div className="detail-status"><Badge tone={`status-${ticket.status}`}>{statusNames[ticket.status] || ticket.status}</Badge><span>{shortDate(ticket.created_at)}</span><Badge tone={`severity-${severityLabel(ticket.severity).toLowerCase()}`}>{severityLabel(ticket.severity)} · {ticket.severity_score ?? ticket.severity * 20}/100</Badge>{ticket.duplicate_count > 1 && <Badge tone="status-assigned">{ticket.duplicate_count} linked reports</Badge>}</div>{ticket.escalated_to && <div className="escalation-alert">SLA breached · escalated to {ticket.escalated_to}</div>}{ticket.image_url && <img className="evidence-image" src={`${API}${ticket.image_url}`} alt="Submitted civic issue evidence" />}{ticket.video_url && <video className="evidence-video" src={`${API}${ticket.video_url}`} controls />}<h3>Citizen description</h3><p className="description">{ticket.description || 'No written description was provided.'}</p>{ticket.transcript && <div className="observation-box transcript-box"><b>Speech transcript{ticket.transcript_language ? ` · ${ticket.transcript_language}` : ''}</b><p>{ticket.transcript}</p></div>}<div className="detail-facts"><div><small>Assigned department</small><b>{ticket.department || '—'}</b></div><div><small>Location</small><b>{ticket.latitude != null ? `${ticket.latitude.toFixed(4)}, ${ticket.longitude.toFixed(4)}` : 'Not provided'}</b></div></div>{ticket.severity_factors && <><h3>AI severity score · {ticket.severity_score}/100</h3><div className="severity-factors">{Object.entries(ticket.severity_factors).filter(([name, value]) => typeof value === 'number' || ['pothole_size', 'crack_extent', 'water_pooling'].includes(name)).map(([name, value]) => <div key={name}><span>{name.replaceAll('_', ' ')}</span><b>{value}</b></div>)}</div>{ticket.text_issue_type && <p className="observation-note">Text check: {issueNames[ticket.text_issue_type] || ticket.text_issue_type} · {ticket.detected_language || 'language unknown'}{ticket.text_analysis?.urgency_terms?.length ? ` · urgency: ${ticket.text_analysis.urgency_terms.join(', ')}` : ''}</p>}{ticket.location_context?.length > 0 && <p className="observation-note">Nearby context: {ticket.location_context.map(place => `${place.name} (${place.distance_m} m)`).join(', ')}</p>}{ticket.duplicate_reports?.length > 1 && <div className="duplicate-panel"><b>{ticket.duplicate_reports.length} reports clustered as one issue</b><small>Within {ticket.duplicate_reports.map(report => `${report.latitude?.toFixed?.(4) ?? 'location'} ${report.longitude?.toFixed?.(4) ?? ''}`).join(' · ')}</small></div>}</>}{ticket.visual_evidence?.length > 0 && <><h3>Visual evidence</h3><ul className="evidence-list">{ticket.visual_evidence.map((x, i) => <li key={i}>{x}</li>)}</ul></>}{(ticket.ast_tags?.length > 0 || ticket.audio_events != null || ticket.audio_timeline != null) && <><h3>Audio event observations</h3><p className="observation-note">Potential sound labels are model observations that support staff review; they do not confirm an issue on their own.</p><div className="observation-box audio-observations">{ticket.ast_tags?.length > 0 && <div className="sound-tags">{ticket.ast_tags.map((tag, i) => <span key={i}>{tag}</span>)}</div>}{ticket.audio_events != null && <div><b>Detection output</b><pre>{typeof ticket.audio_events === 'string' ? ticket.audio_events : JSON.stringify(ticket.audio_events, null, 2)}</pre></div>}{ticket.audio_timeline != null && <div><b>Timeline output</b><pre>{typeof ticket.audio_timeline === 'string' ? ticket.audio_timeline : JSON.stringify(ticket.audio_timeline, null, 2)}</pre></div>}</div></>}{audioDetectionFailed && <div className="reason-box"><Icon name="alert" size={17} /><div><b>Audio event detection unavailable</b><p>The report was saved; sound analysis could not complete.</p></div></div>}{ticket.review_reasons?.length > 0 && <div className="reason-box"><Icon name="alert" size={17} /><div><b>Review requested</b>{ticket.review_reasons.map((x, i) => <p key={i}>{x.replaceAll('_', ' ')}</p>)}</div></div>}<PublicEngagement ticket={ticket} /><h3>Staff update</h3><div className="edit-grid"><label>Issue type<select value={issue} onChange={e => setIssue(e.target.value)}>{issues.map(k => <option key={k} value={k}>{issueNames[k]}</option>)}</select></label><label>Department<select value={department} onChange={e => setDepartment(e.target.value)}>{departments.map(d => <option key={d}>{d}</option>)}</select></label><label>Severity<select value={severity} onChange={e => setSeverity(+e.target.value)}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} · {severityLabel(n)}</option>)}</select></label><label>Status<select value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(statusNames).map(([k, v]) => <option key={k} value={k} disabled={statusDisabled(ticket.status, k)}>{v}</option>)}</select></label></div><label className="reason-label">Decision reason<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Add a reason (required for staff updates)" /></label>{error && <div className="inline-error">{error}</div>}</div><div className="modal-foot"><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" disabled={!canUpdate || reason.trim().length < 3 || saving} onClick={save}>{saving ? 'Saving…' : ticket.needs_human_review ? 'Review & save' : 'Save changes'}</button></div></section></div>
}
function ReportModal({ onClose, onCreated }) {
  const [image, setImage] = useState(null), [video, setVideo] = useState(null), [audio, setAudio] = useState(null), [description, setDescription] = useState(''), [reporterLabel, setReporterLabel] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState(''), [channels, setChannels] = useState([]), [coords, setCoords] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function locate() { if (!navigator.geolocation) { setError('Location is unavailable in this browser.'); return } navigator.geolocation.getCurrentPosition(p => setCoords({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => setError('Could not access your location. You can submit without it.')) }
  async function submit(e) { e.preventDefault(); if (!image && !video) return; setBusy(true); setError(''); const form = new FormData(); if (image) form.append('image', image); if (video) form.append('video', video); if (description.trim()) form.append('description', description.trim()); if (reporterLabel.trim()) form.append('reporter_label', reporterLabel.trim()); if (email.trim()) form.append('reporter_email', email.trim()); if (phone.trim()) form.append('reporter_phone', phone.trim()); if (channels.length) form.append('notification_channels', channels.join(',')); if (audio) form.append('audio', audio); if (coords) { form.append('latitude', coords.latitude); form.append('longitude', coords.longitude) } try { const ticket = await api('/api/reports', { method: 'POST', body: form }); onCreated(ticket) } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="modal report-modal"><div className="modal-head"><div><div className="eyebrow">COMMUNITY INTAKE</div><h2>Submit a report</h2><p>Share an issue so the right city team can take a look.</p></div><button className="icon-button" onClick={onClose}><Icon name="close" /></button></div><form onSubmit={submit}><div className="report-form-scroll"><label className="field-label">Photo evidence <span>{video ? 'Optional with video' : 'Optional'}</span><label className={`upload-zone ${image ? 'has-file' : ''}`}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setImage(e.target.files?.[0] || null)} /><span className="upload-icon"><Icon name={image ? 'check' : 'upload'} size={21} /></span><strong>{image ? image.name : 'Click to upload a photo'}</strong><small>{image ? `${(image.size / 1024 / 1024).toFixed(1)} MB · ready to attach` : 'JPG, PNG or WEBP · up to 10 MB'}</small></label></label><label className="field-label">Video evidence <span>{image ? 'Optional with photo' : 'Add a photo or video'}</span><label className="audio-upload video-upload"><Icon name="grid" /><span>{video ? video.name : 'Attach a video (MP4, WEBM or MOV, up to 50 MB)'}</span><input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska" onChange={e => setVideo(e.target.files?.[0] || null)} /></label></label><label className="field-label">Description <span>Optional</span><textarea maxLength="4000" value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell us what happened and where…" rows="4" /></label><label className="field-label">Voice note <span>Optional</span><label className="audio-upload"><Icon name="inbox" /><span>{audio ? audio.name : 'Attach a voice note'}</span><input type="file" accept="audio/mpeg,audio/wav,audio/webm,audio/ogg,audio/mp4,audio/m4a" onChange={e => setAudio(e.target.files?.[0] || null)} /></label></label><section className="notify-preferences"><div><b>Tracking updates</b><small>Optional contact details are private. Leave blank to report anonymously.</small></div><label className="field-label">Public display name<input value={reporterLabel} onChange={e => setReporterLabel(e.target.value)} placeholder="Anonymous" maxLength="60" /></label><div className="contact-fields"><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label><label>Phone<input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+919876543210" /></label></div><div className="notify-checks">{[['email', 'Email'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp']].map(([key, label]) => <label key={key}><input type="checkbox" checked={channels.includes(key)} onChange={e => setChannels(e.target.checked ? [...channels, key] : channels.filter(item => item !== key))} />{label}</label>)}</div></section><div className="location-row"><div><strong>Location</strong><small>{coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'Add your location to help staff find the issue.'}</small></div><button type="button" className="secondary-button location-button" onClick={locate}><Icon name="pin" size={16} />{coords ? 'Location added' : 'Use my location'}</button></div>{error && <div className="inline-error">{error}</div>}</div><div className="modal-foot"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={(!image && !video) || busy}><Icon name="plus" />{busy ? 'Analyzing evidence…' : 'Submit report'}</button></div></form></section></div>
}
export default App
