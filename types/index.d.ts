export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled'

export type When = 'now' | 'this-sprint' | 'next-sprint' | 'backlog'

export type Task = {
  id: string
  title: string
  /** The sprint's start date (YYYY-MM-DD), or "backlog". */
  sprint: string
  urgent: boolean
  status: TaskStatus
  owner: string
  rolled: number
  /** Place within its section, smallest first; ties go by id. */
  order: number
  created: string
  /** Absolute path of the task file. */
  file: string
  /** Everything after the frontmatter. */
  body: string
}

export type Teammate = {
  id: string
  name: string
  status: string
  /** The effort its model runs at (low, medium, high…), from its agent type; undefined for a type better-tasks did not register. */
  effort?: string
  /** Context fill, 0 to 100; undefined until its first step. */
  percent?: number
  /** What it does right now ("editing auth.ts"); absent between turns. */
  activity?: string
  /** When that activity began, in ms. */
  activeAt?: number
  /** Its prompt cache: warm (a message now reads it) or cold (it would be written again); undefined before its first request. */
  cache?: 'warm' | 'cold'
  /** Minutes the warm cache is still trusted. */
  cacheMinutesLeft?: number
}

/** A teammate's last model request, as the prompt cache saw it. */
export type CacheStep = { at: number; read: number; created: number }

export type Activity = { text: string; at: number }

/** The periodic status check's record. */
export type StatusCheck = {
  /** The last user prompt or main-session turn, in ms. */
  activeAt: number
  /** The last check, fired or skipped, in ms. */
  checkedAt: number
  /** What the work looked like at the last fired check. */
  fingerprint: string
  /** Checks skipped in a row because nothing changed. */
  quiet: number
  /** A main-session turn is running. */
  busy: boolean
}

export type TurnFacts = {
  asked: boolean
  /** A task was created or noted this turn. */
  filed: boolean
  /** The user's message reads as a question. */
  question: boolean
  /** A user message started this turn (false before the first). */
  prompted: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'better-tasks': {
      tasks: Task[]
      team: Teammate[]
      tokens: Record<string, number>
      /** The current activity per agent id; cleared when its turn ends. */
      activity: Record<string, Activity>
      /** The last request per agent id, for cache warmth. */
      cacheSteps: Record<string, CacheStep>
      notice: string
      /** Task ids the user answered "Mark as resolved" for, until each is closed. */
      resolved: string[]
      turn: TurnFacts
      /** The teammate agent types as last registered (JSON of their specs); '' until they are. */
      teammateTypes: string
      /** The lead's rules as its system prompt shows them this session, and the lead and teammate rules as last sent. */
      rulesSent: { shown: string; lead: string; teammate: string }
      /** Where the wheel left the board's list window; it holds while that task stays selected. */
      listScroll: { start: number; selectedId: string }
      /** The board's search box: shown or not, and its text. */
      search: { isOpen: boolean; query: string }
      /** The periodic status check. */
      statusCheck: StatusCheck
      /** The footer label: sprint progress. */
      footer: string
      /** The Tasks pane's selected task id. */
      selected: string
      /** The task id whose actions hold the keys after Enter; '' for none. */
      acting: string
      /** The task id the pane has picked up for moving; '' for none. */
      moving: string
      /** The Tasks pane's page. */
      page: 'board' | 'config'
      /** The last setting the settings page turned on, counted, so register.tsx can set it up. */
      turnedOn: { field: string; count: number }
    }
  }
}
