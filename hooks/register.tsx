import type { Register } from 'claude-code'

import { registerPane } from './pane'
import { registerScreen } from './screen'

export const register: Register = (on, options) => {
  registerPane(on, options)
  registerScreen(on, options)
}
