import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Hero } from './components/Hero'
import { DeployForm } from './components/DeployForm'
import { VerdictCard } from './components/VerdictCard'
import { RiskLegend } from './components/RiskLegend'
import { Footer } from './components/Footer'
import { Toast } from './components/Toast'
import { WallOfShame } from './components/WallOfShame'
import { generateVerdict } from './lib/generateVerdict'
import { saveShameEntry } from './lib/wallOfShame'
import type { DeploymentSituation } from './types/deployment'
const initial: DeploymentSituation = { day: 'Monday', time: '10:00', coffee: 2, tests: 'All passing', bossOnline: false, confidence: 80 }
function App() {
 const [theme, setTheme] = useState(() => { try { return localStorage.getItem('deploybuddy-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' } })
 const [situation, setSituation] = useState(initial)
 const [submitted, setSubmitted] = useState(initial)
 const [revision, setRevision] = useState(0)
 const [toast, setToast] = useState('')
 const [copied, setCopied] = useState(false)
 const [saved, setSaved] = useState(false)
 const location = useLocation()
 const verdict = generateVerdict(submitted)
 const notify = useCallback((message: string) => setToast(message), [])
 useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('deploybuddy-theme', theme) } catch { /* Theme still works when storage is unavailable. */ } }, [theme])
 useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => { setToast(''); setCopied(false) }, 3500); return () => window.clearTimeout(timer) }, [toast])
 useEffect(() => { document.title = location.pathname === '/wall-of-shame' ? 'Wall of Shame — DeployBuddy' : location.pathname === '/about' ? 'About — DeployBuddy' : 'DeployBuddy — Should I Deploy?'; window.scrollTo(0, 0) }, [location.pathname])
 async function share() { try { await navigator.clipboard.writeText(`DeployBuddy says: ${verdict.title} — ${verdict.risk}% risk. ${verdict.advice}`); setCopied(true); notify('Verdict copied. Send it to your brave colleague.') } catch { notify('Clipboard unavailable. Please allow clipboard access and try again.') } }
 function addToWall() { if (saved || revision === 0 || verdict.risk < 31) return; try { saveShameEntry(submitted, verdict); setSaved(true); notify('Your poor decision has been immortalized.') } catch { notify('Could not save your decision. Please allow local storage and try again.') } }
 return <><Navbar theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')}/><main className="mx-auto w-full max-w-[1120px] px-6 sm:px-8"><Routes><Route path="/" element={<><Hero/><div className="workspace-label"><span><span className="status-dot"/> PRODUCTION READINESS CHECK</span><span>Better safe than on-call.</span></div><div className="workspace"><DeployForm value={situation} onChange={setSituation} onSubmit={() => { setSubmitted({ ...situation }); setRevision(r => r + 1); setCopied(false); setSaved(false) }}/><VerdictCard verdict={verdict} revision={revision} onShare={share} copied={copied} stale={JSON.stringify(situation) !== JSON.stringify(submitted)} onAdd={revision > 0 && verdict.risk >= 31 ? addToWall : undefined} saved={saved}/></div><RiskLegend/><div className="bottom-note"><span>✧</span> Your code may be ready. Are you?</div></>}/><Route path="/wall-of-shame" element={<WallOfShame notify={notify}/>}/><Route path="/about" element={<><Hero/><section className="panel info-panel"><span className="eyebrow">MEET YOUR DEPLOYMENT CONSCIENCE</span><h2>About</h2><p>DeployBuddy turns the little warning signs into one big reality check. Answer honestly, check your risk, and give future-you a fighting chance.</p><p>Friday deploys, failing tests, caffeine overload: every choice adds up. This is a humorous second opinion. Your release checklist still gets the final say.</p><RiskLegend/><Link className="share-button" to="/">← Back to the deployment check</Link></section></>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></main><Footer/>{toast && <Toast message={toast} onClose={() => { setToast(''); setCopied(false) }}/>}</>
}
export default App
