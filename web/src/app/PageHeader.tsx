import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * How a screen puts its title, its `--mono` meta line and its buttons into the
 * top bar (house style §3).
 *
 * A portal rather than shared state, on purpose. State set from an effect needs
 * the actions — which are JSX, and so a new object on every render — in its
 * dependencies, and that is a re-render loop waiting to happen. A portal has no
 * such problem: the page renders its own title and buttons, React simply puts
 * them somewhere else on the screen.
 *
 * The slots arrive through a context because the elements they render into
 * belong to `Layout`, whose refs are not set until after its children have
 * mounted; it holds them in state so the paint after that has them.
 */

export interface HeaderSlots {
  title: HTMLElement | null
  actions: HTMLElement | null
}

export const HeaderSlotContext = createContext<HeaderSlots>({ title: null, actions: null })

export function PageHeader({
  title,
  meta,
  children,
}: {
  title: string
  /** The one mono line under the title: a reference, a count, a status. */
  meta?: ReactNode
  /** The page's actions, which sit on the right of the top bar. */
  children?: ReactNode
}) {
  const slots = useContext(HeaderSlotContext)
  const hasMeta = meta !== undefined && meta !== null && meta !== ''
  return (
    <>
      {slots.title !== null &&
        createPortal(
          <>
            <h1>{title}</h1>
            {hasMeta && <div className="meta">{meta}</div>}
          </>,
          slots.title,
        )}
      {slots.actions !== null && children !== undefined && createPortal(children, slots.actions)}
    </>
  )
}
