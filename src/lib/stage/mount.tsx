import { createRoot } from 'react-dom/client'
import { OpenSearchDemo } from './OpenSearchDemo'

type Theme = 'light' | 'dark'

/** The demo is the only React on the site, and it is loaded only where it is shown. */
export function mount(element: HTMLElement, theme: Theme) {
  const root = createRoot(element)
  root.render(<OpenSearchDemo theme={theme} />)
  return {
    setTheme(next: Theme) {
      root.render(<OpenSearchDemo theme={next} />)
    },
    destroy() {
      root.unmount()
    }
  }
}
