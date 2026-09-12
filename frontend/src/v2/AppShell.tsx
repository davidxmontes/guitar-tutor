import { useState, type ReactNode } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { AUTH_DEV_BYPASS } from '../lib/authBypass';
import './AppShell.css';
import { ThemeToggle } from './ThemeToggle';

type Destination = 'explore' | 'sessions' | 'library' | 'workspace' | 'song';
const paths: Record<Destination | 'collapse', string> = {
  explore: 'm12 3 9 9-9 9-9-9Z M15 9l-2 4-4 2 2-4Z',
  sessions: 'M4 5h16v15H4Z M8 3v4m8-4v4M4 10h16m-12 4h3m-3 3h6',
  library: 'M5 3h14v18l-7-4-7 4Z',
  workspace: 'M3 5h18v14H3Z M9 5v14m0-8h12',
  song: 'M9 18V5l11-2v13M9 9l11-2 M9 18c0 4-6 4-6 1s6-4 6-1m11-2c0 4-6 4-6 1s6-4 6-1',
  collapse: 'M3 4h18v16H3Z M9 4v16m7-12-3 4 3 4',
};
function NavIcon({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
export function AppShell({ active, hasWorkspace, onNavigate, children }: {
  active: Destination; hasWorkspace: boolean; onNavigate: (page: Destination) => void; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  return <div className="v2-app app-shell" data-collapsed={collapsed}>
    <a className="shell-skip" href="#app-content">Skip to content</a>
    <aside className="app-sidebar" aria-label="Main navigation">
      <div className="sidebar-heading"><span className="sidebar-brand"><span className="brand-mark" aria-hidden="true">g.</span><span className="sidebar-label">Guitar Tutor</span></span>
        <button className="sidebar-toggle" title={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed} aria-controls="sidebar-navigation" onClick={() => setCollapsed(value => !value)}><NavIcon name="collapse" /></button>
      </div>
      <nav id="sidebar-navigation" className="sidebar-navigation">
        {([['explore', 'Explore'], ['sessions', 'Sessions'], ['library', 'My Stuff'], ['song', 'Study a song'], ...(hasWorkspace ? [['workspace', 'Current workspace']] : [])] as [Destination, string][]).map(([page, label]) => <button key={page} title={label} aria-label={label} aria-current={active === page ? 'page' : undefined} onClick={() => onNavigate(page)}><NavIcon name={page} /><span className="sidebar-label">{label}</span></button>)}
      </nav>
      <div className="sidebar-bottom"><ThemeToggle />{!AUTH_DEV_BYPASS && <div className="sidebar-account"><UserButton /><span className="sidebar-label">Your account</span></div>}<a href="/classic" title="Classic fallback"><NavIcon name="workspace" /><span className="sidebar-label">Classic fallback</span></a></div>
    </aside>
    <div id="app-content" tabIndex={-1} className="app-content">{children}</div>
  </div>;
}
