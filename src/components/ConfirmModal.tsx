import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'
export function ConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current!
    element.showModal()
    cancel.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return createPortal(<dialog ref={dialog} className="confirm-modal" aria-labelledby="confirm-title" aria-describedby="confirm-message" onCancel={e => { e.preventDefault(); onCancel() }}><span className="modal-icon"><Trash2 size={24}/></span><h2 id="confirm-title">Destroy the evidence?</h2><p id="confirm-message">This will permanently erase your questionable deployment history.</p><div className="modal-actions"><button ref={cancel} className="share-button" onClick={onCancel}>Keep My Shame</button><button className="danger-button" onClick={onConfirm}>Destroy the Evidence</button></div></dialog>, document.body)
}
