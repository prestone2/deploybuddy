import { Terminal, Moon, Sun, ArrowUpRight } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
export function Navbar({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  return <header className="nav"><Link to="/" className="brand"><span className="brand-icon"><Terminal size={21}/></span>Deploy<span>Buddy</span><small>v1.0</small></Link><nav aria-label="Main navigation">{[{ label: 'Home', to: '/' }, { label: 'About', to: '/about' }, { label: 'Wall of Shame', to: '/wall-of-shame' }].map(item => <NavLink key={item.to} to={item.to} end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>{item.label}{item.label === 'Wall of Shame' && <ArrowUpRight size={13}/>}</NavLink>)}<span className="nav-divider"/><button className="theme-toggle" onClick={onToggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button></nav></header>
}
