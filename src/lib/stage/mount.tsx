import { createRoot } from 'react-dom/client'
import { OpenResearchDemo } from './OpenResearchDemo'

type Theme = 'light' | 'dark'

/** The demo is the only React on the site, and it is loaded only where it is shown. */
export function mount(element: HTMLElement, theme: Theme) {
  const root = createRoot(element)
  root.render(<OpenResearchDemo theme={theme} />)
  return {
    setTheme(next: Theme) {
      root.render(<OpenResearchDemo theme={next} />)
    },
    destroy() {
      root.unmount()
    }
  }
}
